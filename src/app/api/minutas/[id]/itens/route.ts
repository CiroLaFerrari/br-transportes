import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  params: Promise<{ id: string }>; // Next 15
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function getMinutaClient() {
  const db: any = prisma as any;
  const client = db?.minutaConferencia;
  if (!client || typeof client.findUnique !== 'function') {
    throw new Error('Prisma Client sem "minutaConferencia". Rode: npx prisma generate e reinicie.');
  }
  return client as typeof prisma.minutaConferencia;
}

function pad4(n: number) {
  return String(n).padStart(4, '0');
}

function safeNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function calcAreaM2FromDims(cmA?: number | null, cmB?: number | null) {
  const a = safeNum(cmA);
  const b = safeNum(cmB);
  if (a == null || b == null || a <= 0 || b <= 0) return null;
  // cm² -> m²
  return (a * b) / 10_000;
}

function calcM3FromDims(cmA?: number | null, cmB?: number | null, cmC?: number | null) {
  const a = safeNum(cmA);
  const b = safeNum(cmB);
  const c = safeNum(cmC);
  if (a == null || b == null || c == null || a <= 0 || b <= 0 || c <= 0) return null;
  // cm³ -> m³
  return (a * b * c) / 1_000_000;
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const minutaId = String(id || '').trim();
    if (!minutaId) return json({ ok: false, error: 'minutaId ausente' }, 400);

    const body = await req.json().catch(() => ({} as any));

    const produtoCode = String(body?.produtoCode || '').trim();
    const quantidade = Math.max(1, Number(body?.quantidade || 1) | 0);
    const observacao = String(body?.observacao || '').trim() || null;

    if (!produtoCode) return json({ ok: false, error: 'Informe o código do produto' }, 400);

    const minutaDb = getMinutaClient();

    // garante que minuta existe
    const m = await minutaDb.findUnique({ where: { id: minutaId }, select: { id: true } });
    if (!m) return json({ ok: false, error: 'Minuta não encontrada' }, 404);

    // tenta localizar produto real pelo code
    const produto = await prisma.produto.findUnique({
      where: { code: produtoCode },
      include: { componentes: true },
    });

    const produtoDescricaoFinal =
      String(body?.produtoDescricao || '').trim() ||
      (produto?.descricao ? String(produto.descricao) : produtoCode);

    // cria item
    const item = await prisma.minutaItem.create({
      data: {
        minutaId,
        produtoId: produto?.id ?? null,
        produtoCode,
        produtoDescricao: produtoDescricaoFinal,
        quantidade,
        desmontavel: Boolean(body?.desmontavel ?? produto?.desmontavel ?? false),
        observacao,
      },
      select: { id: true },
    });

    // etiqueta incremental dentro da minuta
    const existingCount = await prisma.minutaVolume.count({
      where: { minutaItem: { minutaId } },
    });

    const prefix = `MIN-${minutaId.slice(0, 6).toUpperCase()}`;

    const volumesToCreate: any[] = [];

    // Se tiver componentes cadastrados, cria volumes por componente (multiplicando pelas quantidades)
    const comps = Array.isArray(produto?.componentes) ? produto!.componentes : [];

    if (comps.length > 0) {
      // Para cada unidade do item, cria volumes de cada componente
      for (let unit = 0; unit < quantidade; unit++) {
        for (const comp of comps) {
          const compQtd = Math.max(1, Number(comp.quantidade ?? 1) | 0);

          // cria "compQtd" volumes desse componente
          for (let k = 0; k < compQtd; k++) {
            const seq = existingCount + volumesToCreate.length + 1;

            const alturaCm = safeNum(comp.alturaCm);
            const larguraCm = safeNum(comp.larguraCm);
            const comprimentoCm = safeNum(comp.comprimentoCm);

            const areaM2 = safeNum(comp.areaM2) ?? calcAreaM2FromDims(larguraCm, comprimentoCm);
            const volumeM3 = safeNum(comp.volumeM3) ?? calcM3FromDims(alturaCm, larguraCm, comprimentoCm);

            const pesoKg = safeNum(comp.pesoKg);

            volumesToCreate.push({
              minutaItemId: item.id,
              etiqueta: `${prefix}-${pad4(seq)}`,
              tipo: 'COMPONENTE',
              codigo: String(comp.codigo || produtoCode),
              descricao: `${produtoDescricaoFinal} — ${String(comp.nome || 'Componente')}`,
              pesoKg,
              alturaCm,
              larguraCm,
              comprimentoCm,
              areaM2,
              volumeM3,
            });
          }
        }
      }
    } else {
      // Sem componentes: cria 1 volume por quantidade, usando dimensões do produto
      for (let i = 0; i < quantidade; i++) {
        const seq = existingCount + volumesToCreate.length + 1;

        const alturaCm = safeNum(produto?.alturaCm);
        const larguraCm = safeNum(produto?.larguraCm);
        const comprimentoCm = safeNum(produto?.comprimentoCm);

        const areaM2 = safeNum(produto?.areaM2) ?? calcAreaM2FromDims(larguraCm, comprimentoCm);
        const volumeM3 = safeNum(produto?.volumeM3) ?? calcM3FromDims(alturaCm, larguraCm, comprimentoCm);

        const pesoKg = safeNum(produto?.pesoKg);

        volumesToCreate.push({
          minutaItemId: item.id,
          etiqueta: `${prefix}-${pad4(seq)}`,
          tipo: 'PRODUTO',
          codigo: produtoCode,
          descricao: produtoDescricaoFinal,
          pesoKg,
          alturaCm,
          larguraCm,
          comprimentoCm,
          areaM2,
          volumeM3,
        });
      }
    }

    if (volumesToCreate.length > 0) {
      await prisma.minutaVolume.createMany({ data: volumesToCreate });
    }

    return json(
      {
        ok: true,
        itemId: item.id,
        volumesCriados: volumesToCreate.length,
        usandoProduto: Boolean(produto),
        usandoComponentes: comps.length > 0,
      },
      201,
    );
  } catch (e: any) {
    console.error('POST /api/minutas/[id]/itens error:', e);
    return json({ ok: false, error: e?.message || 'Falha ao incluir item' }, 500);
  }
}