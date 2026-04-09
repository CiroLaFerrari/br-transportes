import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/planejamentos/:id/carga/resumo
 *
 * Retorna um resumo da carga do planejamento:
 * - total de peso (kg) usando, quando possível, os dados de Coleta
 * - volume aproximado (m³) usando itens + dimensões de Produto
 * - valor total de frete
 * - detalhamento por parada
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;

    // Confere se o planejamento existe
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

    // Paradas vinculadas a este planejamento
    const paradas = await prisma.parada.findMany({
      where: { planejamentoId: id },
      orderBy: { ordem: 'asc' },
      select: {
        id: true,
        ordem: true,
        label: true,
        kmTrecho: true,
        durMinTrecho: true,
        coletaId: true,
        createdAt: true,
      },
    });

    if (!paradas.length) {
      return NextResponse.json({
        planejamentoId: id,
        totalPesoKg: 0,
        totalVolumeM3: 0,
        totalValorFrete: 0,
        paradas: [],
      });
    }

    const coletaIds = Array.from(
      new Set(
        paradas
          .map(p => p.coletaId)
          .filter((v): v is string => Boolean(v))
      )
    );

    // Coletas (peso total e frete)
    const coletas = coletaIds.length
      ? await prisma.coleta.findMany({
          where: { id: { in: coletaIds } },
          select: {
            id: true,
            nf: true,
            pesoTotalKg: true,
            valorFrete: true,
          },
        })
      : [];

    const coletasMap = new Map(
      coletas.map(c => [c.id, c])
    );

    // Itens coletados para estimar volume por coleta (usando dimensões dos produtos)
    const itens = coletaIds.length
      ? await prisma.itemColetado.findMany({
          where: { coletaId: { in: coletaIds } },
          select: {
            id: true,
            coletaId: true,
            produtoId: true,
            quantidade: true,
          },
        })
      : [];

    const produtoIds = Array.from(
      new Set(itens.map(i => i.produtoId).filter(Boolean))
    );

    const produtos = produtoIds.length
      ? await prisma.produto.findMany({
          where: { id: { in: produtoIds } },
          select: {
            id: true,
            alturaCm: true,
            larguraCm: true,
            comprimentoCm: true,
            volumeM3: true,
          },
        })
      : [];

    const produtoMap = new Map(
      produtos.map(p => [p.id, p])
    );

    // Volume por coleta (m³) calculado a partir dos itens + produto
    const volumePorColeta = new Map<string, number>();

    for (const item of itens) {
      const prod = produtoMap.get(item.produtoId);
      if (!prod) continue;

      const q = item.quantidade ?? 1;

      // volume unitário: se volumeM3 existir, usa; senão calcula por dimensões
      let volUnit = 0;
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
          // cm³ -> m³
          volUnit = (a * l * c) / 1_000_000;
        }
      }

      if (!volUnit || !Number.isFinite(volUnit) || volUnit <= 0) continue;

      const volTotalItem = volUnit * q;
      if (!Number.isFinite(volTotalItem) || volTotalItem <= 0) continue;

      const prev = volumePorColeta.get(item.coletaId) ?? 0;
      volumePorColeta.set(item.coletaId, prev + volTotalItem);
    }

    // Agora montamos o resumo por coleta (peso e volume)
    type ColetaResumo = {
      id: string;
      nf: string | null;
      pesoKg: number;
      volumeM3: number;
      valorFrete: number;
    };

    const coletaResumoMap = new Map<string, ColetaResumo>();

    for (const cid of coletaIds) {
      const c = coletasMap.get(cid);
      if (!c) continue;

      const peso = Number(c.pesoTotalKg ?? 0);
      const vol = Number(volumePorColeta.get(cid) ?? 0);
      const frete = Number(c.valorFrete ?? 0);

      coletaResumoMap.set(cid, {
        id: c.id,
        nf: c.nf ?? null,
        pesoKg: Number.isFinite(peso) ? peso : 0,
        volumeM3: Number.isFinite(vol) ? vol : 0,
        valorFrete: Number.isFinite(frete) ? frete : 0,
      });
    }

    // Totais globais (para % calc)
    let preTotalPeso = 0;
    let preTotalVol = 0;
    let preTotalFrete = 0;
    for (const cr of coletaResumoMap.values()) {
      preTotalPeso += cr.pesoKg;
      preTotalVol += cr.volumeM3;
      preTotalFrete += cr.valorFrete;
    }

    // Resumo por parada
    const paradasResumo = paradas.map(p => {
      const cr = p.coletaId ? coletaResumoMap.get(p.coletaId) : undefined;

      const peso = cr?.pesoKg ?? 0;
      const vol = cr?.volumeM3 ?? 0;
      const frete = cr?.valorFrete ?? 0;

      return {
        paradaId: p.id,
        ordem: p.ordem,
        label: p.label,
        kmTrecho: p.kmTrecho,
        durMinTrecho: p.durMinTrecho,
        coletaId: p.coletaId,
        pesoKg: peso,
        volumeM3: vol,
        valorFrete: frete,
        pctPeso: preTotalPeso > 0 ? Math.round((peso / preTotalPeso) * 10000) / 100 : null,
        pctVolume: preTotalVol > 0 ? Math.round((vol / preTotalVol) * 10000) / 100 : null,
        pctFrete: preTotalFrete > 0 ? Math.round((frete / preTotalFrete) * 10000) / 100 : null,
        coleta: cr ?? null,
      };
    });

    // Totais globais (com base nas coletas)
    let totalPesoKg = 0;
    let totalVolumeM3 = 0;
    let totalValorFrete = 0;

    for (const cr of coletaResumoMap.values()) {
      totalPesoKg += cr.pesoKg;
      totalVolumeM3 += cr.volumeM3;
      totalValorFrete += cr.valorFrete;
    }

    return NextResponse.json({
      planejamentoId: id,
      totalPesoKg,
      totalVolumeM3,
      totalValorFrete,
      paradas: paradasResumo,
    });
  } catch (e: any) {
    console.error('GET /api/planejamentos/[id]/carga/resumo error:', e);
    return NextResponse.json(
      { error: e?.message || 'Erro interno ao gerar resumo de carga.' },
      { status: 500 }
    );
  }
}
