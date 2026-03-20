// src/app/api/planejamentos/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

/**
 * Detecta erro de banco offline (Supabase em manutenção / conexão quebrada)
 */
function isDbOfflineError(e: any): boolean {
  const msg = String(e?.message || '');
  const code = String((e as any)?.code || '');

  return (
    msg.includes("Can't reach database server") ||
    msg.includes('PrismaClientInitializationError') ||
    msg.includes('P1001') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ETIMEDOUT') ||
    code === 'P1001'
  );
}

/**
 * Gera um código de etiqueta único.
 * Formato: ETQ-<HEX>
 */
function novaEtiqueta(): string {
  // 10 bytes = 20 hex chars
  const hex = crypto.randomBytes(10).toString('hex').toUpperCase();
  return `ETQ-${hex}`;
}

type ColetaInput = {
  clienteId: string;
  nf: string;
  cidade: string;
  uf: string;
  valorFrete?: number | null;
  pesoTotalKg?: number | null;
  itens: Array<{
    produtoCodigo: string; // corresponde a Produto.code (map "codigo")
    quantidade: number;
  }>;
};

/**
 * Tenta extrair coletas do payload (sem quebrar se não existir).
 * Esperado: payload.coletas = ColetaInput[]
 */
function extrairColetas(payload: any): ColetaInput[] {
  const raw = payload?.coletas;
  if (!Array.isArray(raw)) return [];

  const coletas: ColetaInput[] = raw
    .filter((c) => c && typeof c === 'object')
    .map((c) => ({
      clienteId: String(c.clienteId || '').trim(),
      nf: String(c.nf || '').trim(),
      cidade: String(c.cidade || '').trim(),
      uf: String(c.uf || '').trim(),
      valorFrete:
        c.valorFrete === undefined || c.valorFrete === null ? null : Number(c.valorFrete),
      pesoTotalKg:
        c.pesoTotalKg === undefined || c.pesoTotalKg === null ? null : Number(c.pesoTotalKg),
      itens: Array.isArray(c.itens)
        ? c.itens
            .filter((i: any) => i && typeof i === 'object')
            .map((i: any) => ({
              produtoCodigo: String(i.produtoCodigo || '').trim(),
              quantidade: Number(i.quantidade || 0),
            }))
            .filter((i: any) => i.produtoCodigo && i.quantidade > 0)
        : [],
    }))
    .filter((c) => c.clienteId && c.nf && c.cidade && c.uf && c.itens.length > 0);

  return coletas;
}

/**
 * Cria Coleta + ItemColetado + ItemVolume (etiquetas).
 *
 * Regra:
 * - Produto.desmontavel=false -> 1 volume por unidade (quantidade)
 * - Produto.desmontavel=true  -> 1 volume por componente (considerando componente.quantidade) * quantidade
 */
async function criarColetasComVolumes(tx: any, coletas: ColetaInput[]) {
  for (const c of coletas) {
    const coleta = await tx.coleta.create({
      data: {
        clienteId: c.clienteId,
        nf: c.nf,
        cidade: c.cidade,
        uf: c.uf,
        valorFrete: c.valorFrete ?? null,
        pesoTotalKg: c.pesoTotalKg ?? null,
        // status/entradaPatioAt têm default no schema (pode setar explícito se quiser)
      },
      select: { id: true },
    });

    // Busca produtos por "code" (Prisma) que é mapeado para coluna "codigo"
    const codigos = c.itens.map((i) => i.produtoCodigo);
    const produtos = await tx.produto.findMany({
      where: { code: { in: codigos } },
      include: { componentes: true },
    });

    const mapProduto = new Map(produtos.map((p: any) => [p.code, p]));

    for (const it of c.itens) {
      const produto = mapProduto.get(it.produtoCodigo);
      if (!produto) throw new Error(`Produto não encontrado: ${it.produtoCodigo}`);

      // ItemColetado.etiqueta é opcional no seu schema — mas a gente preenche para rastreio
      const etiquetaItem = novaEtiqueta();

      const item = await tx.itemColetado.create({
        data: {
          coletaId: coleta.id,
          produtoId: produto.id,
          quantidade: it.quantidade,
          etiqueta: etiquetaItem,
        },
        select: { id: true },
      });

      const volumes: Array<{ etiqueta: string; componenteId?: string | null }> = [];

      const desmontavel =
        !!produto.desmontavel &&
        Array.isArray(produto.componentes) &&
        produto.componentes.length > 0;

      if (desmontavel) {
        for (let u = 0; u < it.quantidade; u++) {
          for (const comp of produto.componentes) {
            const qtdComp = Number(comp.quantidade ?? 1);
            for (let k = 0; k < qtdComp; k++) {
              volumes.push({ etiqueta: novaEtiqueta(), componenteId: comp.id });
            }
          }
        }
      } else {
        for (let u = 0; u < it.quantidade; u++) {
          volumes.push({ etiqueta: novaEtiqueta(), componenteId: null });
        }
      }

      // Cria ItemVolume (status/scannedAt têm default/nullable no schema)
      if (volumes.length) {
        await tx.itemVolume.createMany({
          data: volumes.map((v) => ({
            itemColetadoId: item.id,
            etiqueta: v.etiqueta,
            componenteId: v.componenteId ?? null,
          })),
        });
      }
    }
  }
}

/**
 * GET /api/planejamentos?q=&limit=
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const limitNum = Number(searchParams.get('limit') || '20');
    const limit = Number.isFinite(limitNum) ? limitNum : 20;

    const where = q ? { name: { contains: q, mode: 'insensitive' as const } } : {};

    const list = await prisma.planejamento.findMany({
      where,
      take: Math.min(Math.max(limit, 1), 100),
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, createdAt: true },
    });

    return NextResponse.json(list);
  } catch (e: any) {
    if (isDbOfflineError(e)) {
      console.error('GET /api/planejamentos - banco indisponível:', e?.message);
      return NextResponse.json([], { status: 200 });
    }

    console.error('GET /api/planejamentos error:', e);
    return NextResponse.json(
      { error: e?.message || 'Erro interno ao listar planejamentos.' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/planejamentos
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'JSON inválido no corpo da requisição.' }, { status: 400 });
    }

    const name = String(body?.name || '').trim();
    const payload = body?.payload ?? null;

    if (!name) {
      return NextResponse.json({ error: 'Informe o nome do planejamento (name).' }, { status: 400 });
    }
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json(
        { error: 'Informe um payload válido (objeto com rota calculada).' },
        { status: 400 },
      );
    }

    const coletas = extrairColetas(payload);

    const created = await prisma.$transaction(async (tx) => {
      const planejamento = await tx.planejamento.create({
        data: { name, payload },
        select: { id: true },
      });

      if (coletas.length > 0) {
        await criarColetasComVolumes(tx, coletas);
      }

      return planejamento;
    });

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e: any) {
    if (isDbOfflineError(e)) {
      console.error('POST /api/planejamentos - banco indisponível:', e?.message);
      return NextResponse.json(
        {
          error:
            'Banco de dados indisponível (Supabase em manutenção). Você pode continuar testando a tela, mas salvar o planejamento só vai funcionar quando o banco voltar.',
        },
        { status: 503 },
      );
    }

    console.error('POST /api/planejamentos error:', e);
    return NextResponse.json(
      {
        error: e?.message || 'Erro interno ao criar planejamento.',
        details: String(e?.message || e),
      },
      { status: 500 },
    );
  }
}
