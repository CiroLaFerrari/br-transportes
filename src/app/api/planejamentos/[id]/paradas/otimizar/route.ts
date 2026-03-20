import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

function jserr(e: any) {
  return { name: e?.name, message: e?.message, code: e?.code, meta: e?.meta };
}

// Haversine aproximado em km
function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371; // km
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLon / 2);

  const h =
    sin1 * sin1 +
    Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

// gera todas as permutações (para N pequeno)
function permute(arr: number[]): number[][] {
  const res: number[][] = [];
  const used = Array(arr.length).fill(false);
  const cur: number[] = [];

  function backtrack() {
    if (cur.length === arr.length) {
      res.push([...cur]);
      return;
    }
    for (let i = 0; i < arr.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      cur.push(arr[i]);
      backtrack();
      cur.pop();
      used[i] = false;
    }
  }

  backtrack();
  return res;
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { id: planId } = await ctx.params;

    // Planejamento (para pegar origem do payload)
    const plan = await prisma.planejamento.findUnique({
      where: { id: planId },
      select: { id: true, payload: true },
    });
    if (!plan) {
      return NextResponse.json(
        { error: 'Planejamento não encontrado.' },
        { status: 404 },
      );
    }

    const payloadPoints: Array<{ label?: string; lon?: number; lat?: number }> =
      Array.isArray((plan.payload as any)?.points)
        ? (plan.payload as any).points
        : [];

    const originPayload = payloadPoints[0];
    const originCoord =
      originPayload &&
      typeof originPayload.lon === 'number' &&
      typeof originPayload.lat === 'number' &&
      Number.isFinite(originPayload.lon) &&
      Number.isFinite(originPayload.lat)
        ? { lon: originPayload.lon, lat: originPayload.lat }
        : null;

    // Paradas atuais
    const paradas = await prisma.parada.findMany({
      where: { planejamentoId: planId },
      orderBy: { ordem: 'asc' },
    });

    if (!paradas.length) {
      return NextResponse.json({
        ok: true,
        message: 'Nenhuma parada cadastrada.',
        paradas: [],
      });
    }

    // Só consideramos como "válidas" as que têm coordenadas reais
    const valid = paradas
      .map((p, idx) => ({
        idx,
        id: p.id,
        label: p.label,
        lon: p.lon,
        lat: p.lat,
      }))
      .filter(
        v =>
          Number.isFinite(v.lon) &&
          Number.isFinite(v.lat) &&
          !(v.lon === 0 && v.lat === 0),
      );

    if (valid.length < 2) {
      return NextResponse.json({
        ok: true,
        message: 'Menos de duas paradas com coordenadas válidas; ordem mantida.',
        paradas,
      });
    }

    const coords = valid.map(v => ({ lon: v.lon, lat: v.lat }));

    // Distância total de uma ordem dada (índices no array "valid")
    function routeDistance(order: number[]): number {
      let total = 0;
      let prev =
        originCoord ??
        coords[order[0]]; // se não tem origem, começa na primeira parada

      for (let k = 0; k < order.length; k++) {
        const idx = order[k];
        const cur = coords[idx];
        if (!cur) continue;

        // se não tem origem e é o primeiro, só posiciona
        if (!originCoord && k === 0) {
          prev = cur;
          continue;
        }

        total += haversineKm(
          { lat: prev.lat, lon: prev.lon },
          { lat: cur.lat, lon: cur.lon },
        );
        prev = cur;
      }
      return total;
    }

    // Índices 0..(valid.length-1)
    const baseIdx = valid.map((_v, i) => i);
    let bestOrder: number[] = [];
    let bestDist = Infinity;

    if (valid.length <= 8) {
      // brute force exato
      const all = permute(baseIdx);
      for (const ord of all) {
        const d = routeDistance(ord);
        if (d < bestDist) {
          bestDist = d;
          bestOrder = ord;
        }
      }
    } else {
      // fallback: vizinho mais próximo
      const remaining = [...baseIdx];
      const result: number[] = [];
      let current: number | null = null;

      // começamos do "primeiro" só para ter determinismo
      current = remaining.shift()!;
      result.push(current);

      while (remaining.length) {
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const cand = remaining[i];
          const d = routeDistance(
            result.concat(cand), // aproximação incremental
          );
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        const next = remaining.splice(best, 1)[0];
        result.push(next);
      }

      bestOrder = result;
      bestDist = routeDistance(bestOrder);
    }

    // bestOrder são índices no array "valid".
    // Mapeamos isso para índices no array "paradas" (ordem global).
    const validGlobalIdx = bestOrder.map(pos => valid[pos].idx);

    // Paradas sem coordenadas válidas ficam no final, preservando a ordem relativa
    const invalidGlobalIdx = paradas
      .map((_p, idx) => idx)
      .filter(idx => !validGlobalIdx.includes(idx));

    const finalGlobalIdx = [...validGlobalIdx, ...invalidGlobalIdx];
    const ordenadas = finalGlobalIdx.map(i => paradas[i]);

    // Atualiza a ordem no banco (e zera kmTrecho/durMinTrecho, pois serão recalculados depois)
    await Promise.all(
      ordenadas.map((p, i) =>
        prisma.parada.update({
          where: { id: p.id },
          data: {
            ordem: i + 1,
            kmTrecho: null,
            durMinTrecho: null,
          },
        }),
      ),
    );

    const atualizadas = await prisma.parada.findMany({
      where: { planejamentoId: planId },
      orderBy: { ordem: 'asc' },
    });

    return NextResponse.json({
      ok: true,
      message:
        'Paradas otimizadas com base na menor distância geodésica (aproximação). Recalcule os trechos para atualizar km/min.',
      distanciaAproximadaKm: bestDist,
      paradas: atualizadas,
    });
  } catch (e: any) {
    console.error('[paradas/otimizar] erro', e);
    return NextResponse.json(
      { error: 'Falha ao otimizar paradas', detail: jserr(e) },
      { status: 500 },
    );
  }
}
