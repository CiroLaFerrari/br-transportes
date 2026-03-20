import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// helper: converte string/null em número ou null
function toNumOrNull(v: any): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : null;
}

// helper: calcula área (m²) e volume (m³) a partir de cm
function calcAreaVolume(alturaCm: number | null, larguraCm: number | null, comprimentoCm: number | null) {
  if (alturaCm == null || larguraCm == null || comprimentoCm == null) {
    return { areaM2: null as number | null, volumeM3: null as number | null };
  }

  const a = Number(alturaCm);
  const l = Number(larguraCm);
  const c = Number(comprimentoCm);

  if (![a, l, c].every(Number.isFinite)) {
    return { areaM2: null, volumeM3: null };
  }

  const areaM2 = (l * c) / 10000; // cm² -> m²
  const volumeM3 = (a * l * c) / 1_000_000; // cm³ -> m³

  return { areaM2, volumeM3 };
}

/**
 * GET /api/produtos/[id]/componentes
 * Lista componentes de um produto.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;

    const componentes = await prisma.componente.findMany({
      where: { produtoId: id },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(componentes);
  } catch (e: any) {
    console.error('GET /api/produtos/[id]/componentes error:', e);
    return NextResponse.json({ error: e?.message || 'Falha ao listar componentes.' }, { status: 500 });
  }
}

/**
 * POST /api/produtos/[id]/componentes
 * Cria um componente para o produto.
 * Body esperado:
 * {
 *   codigo: string,                  // ✅ OBRIGATÓRIO (schema)
 *   nome: string,
 *   quantidade?: number,
 *   pesoKg?: number | string | null,
 *   alturaCm?: number | string | null,
 *   larguraCm?: number | string | null,
 *   comprimentoCm?: number | string | null,
 *   observacao?: string | null
 * }
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;

    const ct = req.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return NextResponse.json({ error: 'Content-Type deve ser application/json' }, { status: 415 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    // ✅ codigo obrigatório e único por produto
    const codigo = String(body?.codigo || '').trim();
    if (!codigo) {
      return NextResponse.json({ error: 'Informe o código do componente (obrigatório).' }, { status: 400 });
    }

    const nome = String(body?.nome || '').trim();
    if (!nome) {
      return NextResponse.json({ error: 'Informe nome do componente.' }, { status: 400 });
    }

    const quantidadeRaw = body?.quantidade ?? 1;
    const quantidade = Number.isFinite(Number(quantidadeRaw)) ? Number(quantidadeRaw) : 1;

    const pesoKg = toNumOrNull(body?.pesoKg);
    const alturaCm = toNumOrNull(body?.alturaCm);
    const larguraCm = toNumOrNull(body?.larguraCm);
    const comprimentoCm = toNumOrNull(body?.comprimentoCm);

    if (alturaCm !== null && !Number.isFinite(alturaCm)) {
      return NextResponse.json({ error: 'alturaCm inválido.' }, { status: 400 });
    }
    if (larguraCm !== null && !Number.isFinite(larguraCm)) {
      return NextResponse.json({ error: 'larguraCm inválido.' }, { status: 400 });
    }
    if (comprimentoCm !== null && !Number.isFinite(comprimentoCm)) {
      return NextResponse.json({ error: 'comprimentoCm inválido.' }, { status: 400 });
    }

    const { areaM2, volumeM3 } = calcAreaVolume(alturaCm, larguraCm, comprimentoCm);

    const created = await prisma.componente.create({
      data: {
        produtoId: id,
        codigo, // ✅ NOVO
        nome, // campo mapeado (descricao)
        quantidade,
        pesoKg,
        alturaCm,
        larguraCm,
        comprimentoCm,
        areaM2,
        volumeM3,
        observacao: body?.observacao ? String(body.observacao) : null,
      },
      select: { id: true },
    });

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e: any) {
    console.error('POST /api/produtos/[id]/componentes error:', e);

    // ✅ trata duplicado de @@unique([produtoId, codigo]) como 409
    if (String(e?.code) === 'P2002') {
      return NextResponse.json({ error: 'Já existe um componente com esse código para este produto.' }, { status: 409 });
    }

    return NextResponse.json({ error: e?.message || 'Falha ao criar componente.' }, { status: 500 });
  }
}