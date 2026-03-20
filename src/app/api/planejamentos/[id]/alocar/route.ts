import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Conflito de agenda: [A,B] e [C,D] se sobrepõem quando A < D && B > C
function hasOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();

    const motoristaId: string | null = body?.motoristaId ?? null;
    const veiculoId: string | null   = body?.veiculoId ?? null;
    const planStartAtStr: string     = body?.planStartAt;
    const planEndAtStr: string       = body?.planEndAt;

    if (!planStartAtStr || !planEndAtStr) {
      return NextResponse.json({ error: 'planStartAt e planEndAt são obrigatórios (ISO 8601).' }, { status: 400 });
    }

    const planStartAt = new Date(planStartAtStr);
    const planEndAt   = new Date(planEndAtStr);

    if (!(planStartAt instanceof Date) || isNaN(planStartAt.getTime()) ||
        !(planEndAt instanceof Date)   || isNaN(planEndAt.getTime())) {
      return NextResponse.json({ error: 'Datas inválidas. Ex.: 2025-11-05T08:00:00.000Z' }, { status: 400 });
    }
    if (planEndAt <= planStartAt) {
      return NextResponse.json({ error: 'planEndAt deve ser maior que planStartAt.' }, { status: 400 });
    }

    const plan = await prisma.planejamento.findUnique({ where: { id } });
    if (!plan) return NextResponse.json({ error: 'Planejamento não encontrado.' }, { status: 404 });

    if (motoristaId) {
      const mExists = await prisma.motorista.findUnique({ where: { id: motoristaId } });
      if (!mExists) return NextResponse.json({ error: 'Motorista não encontrado.' }, { status: 400 });

      const conflitosMotorista = await prisma.planejamento.findMany({
        where: {
          id: { not: id },
          motoristaId,
          status: { in: ['PLANNED', 'IN_TRANSIT'] as any },
          planStartAt: { not: null },
          planEndAt: { not: null },
        },
        select: { id: true, planStartAt: true, planEndAt: true, name: true },
      });

      const conflito = conflitosMotorista.find(p =>
        p.planStartAt && p.planEndAt && hasOverlap(planStartAt, planEndAt, p.planStartAt, p.planEndAt)
      );
      if (conflito) {
        return NextResponse.json({
          error: `Conflito de agenda do motorista no planejamento ${conflito.id} (${conflito.name}).`,
        }, { status: 409 });
      }
    }

    if (veiculoId) {
      const vExists = await prisma.veiculo.findUnique({ where: { id: veiculoId } });
      if (!vExists) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 400 });

      const conflitosVeiculo = await prisma.planejamento.findMany({
        where: {
          id: { not: id },
          veiculoId,
          status: { in: ['PLANNED', 'IN_TRANSIT'] as any },
          planStartAt: { not: null },
          planEndAt: { not: null },
        },
        select: { id: true, planStartAt: true, planEndAt: true, name: true },
      });

      const conflito = conflitosVeiculo.find(p =>
        p.planStartAt && p.planEndAt && hasOverlap(planStartAt, planEndAt, p.planStartAt, p.planEndAt)
      );
      if (conflito) {
        return NextResponse.json({
          error: `Conflito de agenda do veículo no planejamento ${conflito.id} (${conflito.name}).`,
        }, { status: 409 });
      }
    }

    const updated = await prisma.planejamento.update({
      where: { id },
      data: {
        motoristaId,
        veiculoId,
        planStartAt,
        planEndAt,
        status: plan.status === 'DRAFT' ? 'PLANNED' : plan.status,
      },
      select: {
        id: true, name: true, status: true,
        motoristaId: true, veiculoId: true, planStartAt: true, planEndAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (e: any) {
    console.error('POST /api/planejamentos/[id]/alocar error:', e);
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const plan = await prisma.planejamento.findUnique({ where: { id } });
    if (!plan) return NextResponse.json({ error: 'Planejamento não encontrado.' }, { status: 404 });

    const updated = await prisma.planejamento.update({
      where: { id },
      data: {
        motoristaId: null,
        veiculoId: null,
        planStartAt: null,
        planEndAt: null,
      },
      select: {
        id: true, name: true, status: true,
        motoristaId: true, veiculoId: true, planStartAt: true, planEndAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (e: any) {
    console.error('DELETE /api/planejamentos/[id]/alocar error:', e);
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 });
  }
}
