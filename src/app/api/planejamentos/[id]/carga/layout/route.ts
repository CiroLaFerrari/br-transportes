import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/planejamentos/:id/carga/layout
 *
 * Devolve uma lista de "caixas" (boxes) de carga para alimentar
 * um motor de layout 2D/3D:
 * - vinculado a coletas e produtos
 * - usando dimensões e flags do Produto
 *
 * Obs.: aqui NÃO estimamos peso por item para não "inventar" dado.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;

    const plan = await prisma.planejamento.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!plan) {
      return NextResponse.json(
        { error: 'Planejamento não encontrado.' },
        { status: 404 }
      );
    }

    const paradas = await prisma.parada.findMany({
      where: { planejamentoId: id },
      orderBy: { ordem: 'asc' },
      select: {
        id: true,
        ordem: true,
        coletaId: true,
      },
    });

    const coletaIds = Array.from(
      new Set(
        paradas
          .map(p => p.coletaId)
          .filter((v): v is string => Boolean(v))
      )
    );

    if (!coletaIds.length) {
      return NextResponse.json({
        planejamentoId: id,
        boxes: [],
      });
    }

    const coletas = await prisma.coleta.findMany({
      where: { id: { in: coletaIds } },
      select: {
        id: true,
        nf: true,
      },
    });

    const coletasMap = new Map(
      coletas.map(c => [c.id, c])
    );

    const itens = await prisma.itemColetado.findMany({
      where: { coletaId: { in: coletaIds } },
      select: {
        id: true,
        coletaId: true,
        produtoId: true,
        quantidade: true,
      },
    });

    const produtoIds = Array.from(
      new Set(itens.map(i => i.produtoId).filter(Boolean))
    );

    if (!produtoIds.length) {
      return NextResponse.json({
        planejamentoId: id,
        boxes: [],
      });
    }

    const produtos = await prisma.produto.findMany({
      where: { id: { in: produtoIds } },
      select: {
        id: true,
        code: true,
        descricao: true,
        alturaCm: true,
        larguraCm: true,
        comprimentoCm: true,
        areaM2: true,
        volumeM3: true,
        embalado: true,
        tipoEmbalagem: true,
        fragil: true,
        empilhavel: true,
        posicao: true,
        desmontavel: true,
      },
    });

    const produtoMap = new Map(
      produtos.map(p => [p.id, p])
    );

    const paradaPorColeta = new Map<string, { paradaId: string; ordem: number }[]>();
    for (const p of paradas) {
      if (!p.coletaId) continue;
      const arr = paradaPorColeta.get(p.coletaId) ?? [];
      arr.push({ paradaId: p.id, ordem: p.ordem });
      paradaPorColeta.set(p.coletaId, arr);
    }

    const boxes: any[] = [];

    for (const item of itens) {
      const prod = produtoMap.get(item.produtoId);
      if (!prod) continue;

      const coleta = coletasMap.get(item.coletaId);
      const paradasColeta = paradaPorColeta.get(item.coletaId) ?? [];

      const q = item.quantidade ?? 1;

      // volume unitário: se volumeM3 exist, usa; senão calcula
      let volUnit: number | null = null;
      if (typeof prod.volumeM3 === 'number' && Number.isFinite(prod.volumeM3)) {
        volUnit = prod.volumeM3;
      } else if (
        prod.alturaCm != null &&
        prod.larguraCm != null &&
        prod.comprimentoCm != null
      ) {
        const a = Number(prod.alturaCm);
        const l = Number(prod.larguraCm);
        const c = Number(prod.comprimentoCm);
        if ([a, l, c].every(Number.isFinite)) {
          volUnit = (a * l * c) / 1_000_000;
        }
      }

      boxes.push({
        itemId: item.id,
        coletaId: item.coletaId,
        coletaNF: coleta?.nf ?? null,
        produtoId: prod.id,
        produtoCode: prod.code,
        produtoDescricao: prod.descricao,
        quantidade: q,
        alturaCm: prod.alturaCm,
        larguraCm: prod.larguraCm,
        comprimentoCm: prod.comprimentoCm,
        areaM2: prod.areaM2 ?? null,
        volumeM3Unit: volUnit,
        volumeM3Total:
          volUnit && Number.isFinite(volUnit) ? volUnit * q : null,
        embalado: prod.embalado,
        tipoEmbalagem: prod.tipoEmbalagem ?? null,
        fragil: prod.fragil,
        empilhavel: prod.empilhavel,
        posicao: prod.posicao ?? null,
        desmontavel: prod.desmontavel,
        // peso não estimado aqui propositalmente (evitar "inventar" distribuição)
        pesoKgEstimado: null,
        paradas: paradasColeta,
      });
    }

    return NextResponse.json({
      planejamentoId: id,
      boxes,
    });
  } catch (e: any) {
    console.error('GET /api/planejamentos/[id]/carga/layout error:', e);
    return NextResponse.json(
      { error: e?.message || 'Erro interno ao gerar layout de carga.' },
      { status: 500 }
    );
  }
}
