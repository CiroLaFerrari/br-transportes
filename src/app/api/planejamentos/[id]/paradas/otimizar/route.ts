import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';

type Coord = [number, number]; // [lon, lat]

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

    // Recalcula rota real via ORS usando coordenadas existentes
    const orsKey = process.env.ORS_API_KEY || '';
    let routeGeojson: any = null;
    let routeLegs: Array<{ from: string; to: string; km: number; dur_min: number }> = [];
    let routeTotalKm = 0;
    let routeTotalMin = 0;

    if (orsKey) {
      try {
        // Build ordered coordinate list: origin (if available) + paradas
        const allCoords: Array<{ lon: number; lat: number; label: string }> = [];
        if (originCoord) {
          allCoords.push({ lon: originCoord.lon, lat: originCoord.lat, label: originPayload?.label || 'Origem' });
        }
        for (const idx of validGlobalIdx) {
          const p = paradas[idx];
          allCoords.push({ lon: p.lon, lat: p.lat, label: p.label });
        }

        if (allCoords.length >= 2) {
          const features: any[] = [];
          const legs: Array<{ from: string; to: string; km: number; dur_min: number }> = [];

          for (let i = 0; i < allCoords.length - 1; i++) {
            const a: Coord = [allCoords[i].lon, allCoords[i].lat];
            const b: Coord = [allCoords[i + 1].lon, allCoords[i + 1].lat];

            const resp = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
              method: 'POST',
              headers: { 'Authorization': orsKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                coordinates: [a, b],
                instructions: false,
                units: 'km',
                language: 'pt',
                radiuses: [5000, 5000],
              }),
            });

            if (!resp.ok) {
              console.warn(`[otimizar] ORS leg ${i} failed:`, await resp.text().catch(() => ''));
              continue;
            }

            const geo = await resp.json();
            const feat = geo?.features?.[0];
            const sum = feat?.properties?.summary;

            const rawDist = Number(sum?.distance ?? 0);
            const seconds = Number(sum?.duration ?? 0);

            // Detect unit: haversine check
            const R = 6371;
            const toRad = (x: number) => x * Math.PI / 180;
            const dLat = toRad(b[1] - a[1]);
            const dLon = toRad(b[0] - a[0]);
            const hav = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
            const great = 2 * R * Math.asin(Math.sqrt(hav));
            const km = (great > 5 && rawDist > 1000) ? Number((rawDist / 1000).toFixed(2)) : Number(rawDist.toFixed(2));
            const dur_min = Math.round(seconds / 60);

            features.push({
              type: 'Feature',
              properties: { from: allCoords[i].label, to: allCoords[i + 1].label, km, dur_min, idx: i + 1 },
              geometry: feat.geometry,
            });
            legs.push({ from: allCoords[i].label, to: allCoords[i + 1].label, km, dur_min });

            routeTotalKm += km;
            routeTotalMin += dur_min;
          }

          routeGeojson = { type: 'FeatureCollection', features };
          routeLegs = legs;

          // Update km/min on paradas in DB
          const paradaStart = originCoord ? 0 : 1; // if origin exists, leg 0 = origin→parada0
          for (let i = 0; i < validGlobalIdx.length; i++) {
            const legIdx = originCoord ? i : i; // leg index for this parada
            const leg = legs[legIdx];
            if (leg) {
              await prisma.parada.update({
                where: { id: paradas[validGlobalIdx[i]].id },
                data: {
                  kmTrecho: leg.km,
                  durMinTrecho: leg.dur_min,
                },
              });
            }
          }

          // Update planejamento payload with new route data
          const points = allCoords.map(c => ({ label: c.label, lon: c.lon, lat: c.lat }));
          await prisma.planejamento.update({
            where: { id: planId },
            data: {
              payload: {
                points,
                legs: routeLegs,
                total_km: Number(routeTotalKm.toFixed(2)),
                total_dur_min: routeTotalMin,
                geojson: routeGeojson,
              },
            },
          });
        }
      } catch (routeErr: any) {
        console.warn('[otimizar] ORS route calc failed (non-fatal):', routeErr?.message);
      }
    }

    const atualizadas = await prisma.parada.findMany({
      where: { planejamentoId: planId },
      orderBy: { ordem: 'asc' },
      select: {
        id: true,
        ordem: true,
        label: true,
        lon: true,
        lat: true,
        kmTrecho: true,
        durMinTrecho: true,
        coletaId: true,
        createdAt: true,
        Coleta: {
          select: {
            id: true,
            nf: true,
            cidade: true,
            uf: true,
            valorFrete: true,
            pesoTotalKg: true,
            Cliente: { select: { id: true, razao: true, percentualFrete: true } },
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      message: routeGeojson
        ? 'Paradas otimizadas e rota recalculada.'
        : 'Paradas otimizadas (rota não recalculada — clique em "Calcular rota").',
      distanciaAproximadaKm: bestDist,
      routeTotalKm: Number(routeTotalKm.toFixed(2)),
      routeTotalMin,
      paradas: atualizadas,
      route: routeGeojson ? {
        points: routeLegs.length > 0 ? (() => {
          const pts: Array<{ label: string; lon: number; lat: number }> = [];
          if (originCoord) pts.push({ label: originPayload?.label || 'Origem', lon: originCoord.lon, lat: originCoord.lat });
          for (const idx of validGlobalIdx) {
            pts.push({ label: paradas[idx].label, lon: paradas[idx].lon, lat: paradas[idx].lat });
          }
          return pts;
        })() : [],
        legs: routeLegs,
        total_km: Number(routeTotalKm.toFixed(2)),
        total_dur_min: routeTotalMin,
        geojson: routeGeojson,
      } : null,
    });
  } catch (e: any) {
    console.error('[paradas/otimizar] erro', e);
    return NextResponse.json(
      { error: 'Falha ao otimizar paradas', detail: jserr(e) },
      { status: 500 },
    );
  }
}
