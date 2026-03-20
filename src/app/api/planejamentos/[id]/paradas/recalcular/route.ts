import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

function jserr(e: any) {
  return { name: e?.name, message: e?.message, code: e?.code, meta: e?.meta };
}

function normKm(leg: any): number | null {
  if (!leg) return null;
  if (typeof leg.km === 'number' && Number.isFinite(leg.km)) return leg.km;
  if (typeof leg.distance === 'number' && Number.isFinite(leg.distance)) {
    return leg.distance > 1000 ? leg.distance / 1000 : leg.distance;
  }
  return null;
}

function normMin(leg: any): number | null {
  if (!leg) return null;
  if (typeof leg.dur_min === 'number' && Number.isFinite(leg.dur_min)) {
    return Math.round(leg.dur_min);
  }
  if (typeof leg.duration === 'number' && Number.isFinite(leg.duration)) {
    return Math.round(leg.duration / 60);
  }
  return null;
}

/**
 * POST /api/planejamentos/:id/paradas/recalcular
 * Reaplica kmTrecho/durMinTrecho em cada parada com base no payload.legs
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { id: planId } = await ctx.params;

    const plan = await prisma.planejamento.findUnique({
      where: { id: planId },
      select: { id: true, payload: true },
    });

    if (!plan) {
      return NextResponse.json(
        { error: 'Planejamento não encontrado.' },
        { status: 404 }
      );
    }

    const payload: any = plan.payload || {};
    const legs: any[] = Array.isArray(payload.legs) ? payload.legs : [];

    const paradas = await prisma.parada.findMany({
      where: { planejamentoId: planId },
      orderBy: { ordem: 'asc' },
    });

    const updates = paradas.map((p, idx) => {
      const leg = legs[idx] || null;
      const kmTrecho = normKm(leg);
      const durMinTrecho = normMin(leg);
      return prisma.parada.update({
        where: { id: p.id },
        data: {
          kmTrecho: kmTrecho ?? undefined,
          durMinTrecho: durMinTrecho ?? undefined,
        },
      });
    });

    const result = await prisma.$transaction(updates);

    return NextResponse.json({
      ok: true,
      planejamentoId: planId,
      paradasAtualizadas: result,
    });
  } catch (e: any) {
    console.error('[paradas/recalcular] error:', e);
    return NextResponse.json(
      { error: 'Falha ao recalcular paradas', detail: jserr(e) },
      { status: 500 }
    );
  }
}
