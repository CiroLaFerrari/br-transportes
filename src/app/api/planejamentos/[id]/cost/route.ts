import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

/**
 * POST /api/planejamentos/:id/cost
 * Body:
 * {
 *   diesel_price: number,                // preço do litro do diesel (R$)
 *   consumption_km_per_litre: number,    // consumo (km por litro)
 *   driver_hourly: number,               // custo motorista (R$/hora)
 *   tolls?: number[],                    // pedágios (R$)
 *   extras?: { label: string; value: number }[]
 * }
 *
 * Retorna:
 * {
 *   ok: true,
 *   planejamentoId: string,
 *   breakdown: {
 *     distance_km: number,
 *     duration_min: number,
 *     fuel_liters: number,
 *     fuel_cost: number,
 *     driver_hours: number,
 *     driver_cost: number,
 *     tolls_total: number,
 *     extras_total: number,
 *     subtotal: number,
 *     total: number
 *   },
 *   inputs: { ...request body... },
 *   sources: {
 *     used_paradas_km: boolean,
 *     used_payload_total_km: boolean,
 *     used_payload_total_dur: boolean
 *   }
 * }
 */

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const {
      diesel_price,
      consumption_km_per_litre,
      driver_hourly,
      tolls = [],
      extras = [],
    } = await req.json();

    // validações simples
    if (
      typeof diesel_price !== 'number' ||
      typeof consumption_km_per_litre !== 'number' ||
      typeof driver_hourly !== 'number'
    ) {
      return NextResponse.json(
        { error: 'Parâmetros inválidos: diesel_price, consumption_km_per_litre e driver_hourly são obrigatórios (number).' },
        { status: 400 }
      );
    }

    // carrega planejamento
    const plan = await prisma.planejamento.findUnique({
      where: { id },
    });

    if (!plan) {
      return NextResponse.json({ error: 'Planejamento não encontrado.' }, { status: 404 });
    }

    // carrega paradas (se existirem) para somar kmTrecho
    const paradas = await prisma.parada.findMany({
      where: { planejamentoId: id },
      orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
      select: { kmTrecho: true, durMinTrecho: true },
    });

    // Estratégia:
    // 1) se houver paradas com kmTrecho -> soma
    // 2) se não houver, tenta usar plan.payload.total_km e total_dur_min
    let distance_km = 0;
    let duration_min = 0;

    let used_paradas_km = false;
    let used_payload_total_km = false;
    let used_payload_total_dur = false;

    if (paradas.length > 0) {
      let sumKm = 0;
      let sumMin = 0;
      for (const p of paradas) {
        if (typeof p.kmTrecho === 'number') sumKm += p.kmTrecho;
        if (typeof p.durMinTrecho === 'number') sumMin += p.durMinTrecho;
      }
      if (sumKm > 0) {
        distance_km = sumKm;
        used_paradas_km = true;
      }
      if (sumMin > 0) {
        duration_min = sumMin;
      }
    }

    // fallback do payload do planejamento
    const payload: any = plan.payload ?? {};
    if (!used_paradas_km && typeof payload.total_km === 'number') {
      distance_km = payload.total_km;
      used_payload_total_km = true;
    }
    if (duration_min <= 0 && typeof payload.total_dur_min === 'number') {
      duration_min = payload.total_dur_min;
      used_payload_total_dur = true;
    }

    // se ainda assim sem distância, retorna 400
    if (!distance_km || distance_km <= 0) {
      return NextResponse.json(
        { error: 'Não foi possível determinar a distância (km). Crie paradas com kmTrecho ou preencha payload.total_km.' },
        { status: 400 }
      );
    }

    // cálculo de combustível
    const fuel_liters = distance_km / consumption_km_per_litre;
    const fuel_cost = fuel_liters * diesel_price;

    // custo de motorista (se duration_min não disponível, aproxima por distância a 60km/h)
    let driver_minutes = duration_min;
    if (!driver_minutes || driver_minutes <= 0) {
      // fallback grosseiro: 60 km/h
      driver_minutes = (distance_km / 60) * 60;
    }
    const driver_hours = driver_minutes / 60;
    const driver_cost = driver_hours * driver_hourly;

    // pedágios e extras
    const tolls_total =
      Array.isArray(tolls) ? tolls.filter(n => typeof n === 'number').reduce((a, b) => a + b, 0) : 0;

    const extras_total =
      Array.isArray(extras)
        ? extras
            .filter((e: any) => e && typeof e.value === 'number')
            .reduce((a: number, e: any) => a + e.value, 0)
        : 0;

    const subtotal = fuel_cost + driver_cost + tolls_total + extras_total;
    const total = subtotal;

    return NextResponse.json({
      ok: true,
      planejamentoId: id,
      inputs: {
        diesel_price,
        consumption_km_per_litre,
        driver_hourly,
        tolls,
        extras,
      },
      breakdown: {
        distance_km: Number(distance_km.toFixed(2)),
        duration_min: Math.round(driver_minutes),
        fuel_liters: Number(fuel_liters.toFixed(2)),
        fuel_cost: Number(fuel_cost.toFixed(2)),
        driver_hours: Number(driver_hours.toFixed(2)),
        driver_cost: Number(driver_cost.toFixed(2)),
        tolls_total: Number(tolls_total.toFixed(2)),
        extras_total: Number(extras_total.toFixed(2)),
        subtotal: Number(subtotal.toFixed(2)),
        total: Number(total.toFixed(2)),
      },
      sources: {
        used_paradas_km,
        used_payload_total_km,
        used_payload_total_dur,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Falha ao calcular custo', detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
