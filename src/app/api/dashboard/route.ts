import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function msToDays(ms: number) {
  return Math.round((ms / (1000 * 60 * 60 * 24)) * 100) / 100;
}

export async function GET() {
  try {
    const now = new Date();

    const [
      coletasEmPatio,
      coletasCarregadas,
      coletasEmTransito,
      coletasEntregues,
      totalColetas,
      totalVeiculos,
      totalMotoristas,
      motoristasDisponiveis,
      planejamentosDraft,
      planejamentosPlanned,
      planejamentosTransit,
      planejamentosDone,
      patioRows,
      recentColetas,
    ] = await Promise.all([
      prisma.coleta.count({ where: { status: 'EM_PATIO' } }),
      prisma.coleta.count({ where: { status: 'CARREGADA' } }),
      prisma.coleta.count({ where: { status: 'EM_TRANSITO' } }),
      prisma.coleta.count({ where: { status: 'ENTREGUE' } }),
      prisma.coleta.count(),
      prisma.veiculo.count(),
      prisma.motorista.count(),
      prisma.motorista.count({ where: { disponibilidade: true } }),
      prisma.planejamento.count({ where: { status: 'DRAFT' } }),
      prisma.planejamento.count({ where: { status: 'PLANNED' } }),
      prisma.planejamento.count({ where: { status: 'IN_TRANSIT' } }),
      prisma.planejamento.count({ where: { status: 'DONE' } }),
      // Para calcular lead time médio
      prisma.coleta.findMany({
        where: { status: 'EM_PATIO' },
        select: { entradaPatioAt: true },
        orderBy: { entradaPatioAt: 'asc' },
      }),
      // Últimas 5 coletas
      prisma.coleta.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          nf: true,
          cidade: true,
          uf: true,
          status: true,
          pesoTotalKg: true,
          valorFrete: true,
          entradaPatioAt: true,
          Cliente: { select: { razao: true } },
        },
      }),
    ]);

    // Lead time médio das coletas no pátio
    let leadTimeMedioDias: number | null = null;
    let leadTimeMaxDias: number | null = null;
    let coletasAcimaLeadTime = 0;
    const LEAD_TIME_ALERTA_DIAS = 15;

    if (patioRows.length > 0) {
      let somaMs = 0;
      let maxMs = 0;
      for (const c of patioRows) {
        if (c.entradaPatioAt) {
          const ms = now.getTime() - c.entradaPatioAt.getTime();
          somaMs += ms;
          if (ms > maxMs) maxMs = ms;
          if (msToDays(ms) > LEAD_TIME_ALERTA_DIAS) coletasAcimaLeadTime++;
        }
      }
      leadTimeMedioDias = msToDays(somaMs / patioRows.length);
      leadTimeMaxDias = msToDays(maxMs);
    }

    // Peso total no pátio
    const patioAgg = await prisma.coleta.aggregate({
      where: { status: 'EM_PATIO' },
      _sum: { pesoTotalKg: true, valorFrete: true },
    });

    return NextResponse.json({
      ok: true,
      coletas: {
        emPatio: coletasEmPatio,
        carregadas: coletasCarregadas,
        emTransito: coletasEmTransito,
        entregues: coletasEntregues,
        total: totalColetas,
      },
      patio: {
        pesoTotalKg: patioAgg._sum.pesoTotalKg ?? 0,
        valorFreteTotal: patioAgg._sum.valorFrete ?? 0,
        leadTimeMedioDias,
        leadTimeMaxDias,
        coletasAcimaLeadTime,
        alertaDias: LEAD_TIME_ALERTA_DIAS,
      },
      frota: {
        totalVeiculos,
        totalMotoristas,
        motoristasDisponiveis,
      },
      planejamentos: {
        draft: planejamentosDraft,
        planned: planejamentosPlanned,
        inTransit: planejamentosTransit,
        done: planejamentosDone,
      },
      recentColetas: recentColetas.map((c) => ({
        ...c,
        leadTimeDias: c.entradaPatioAt
          ? msToDays(now.getTime() - c.entradaPatioAt.getTime())
          : null,
      })),
    });
  } catch (e: any) {
    console.error('GET /api/dashboard error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erro interno' }, { status: 500 });
  }
}
