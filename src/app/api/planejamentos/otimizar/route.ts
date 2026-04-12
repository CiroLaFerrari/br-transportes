import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/planejamento/otimizar
 * body: { origin: string, destinos: string[] }
 *
 * Passos:
 * 1) Geocodifica origem e destinos (ORS Geocode)
 * 2) Pede matriz ALL-to-ALL (ORS Matrix - driving-car)
 * 3) Heurística TSP: Vizinho Mais Próximo + 2-opt (opcional)
 * 4) Retorna ordem otimizada, km total e quebras por trecho
 *
 * Obs: ORS é grátis (precisa ORS_API_KEY no .env).
 */

type Coord = [number, number]; // [lon, lat]

async function geocodeOne(q: string, key: string): Promise<Coord | null> {
  const url = new URL('https://api.openrouteservice.org/geocode/search');
  url.searchParams.set('api_key', key);
  url.searchParams.set('text', q);
  url.searchParams.set('size', '1');
  url.searchParams.set('boundary.country', 'BR');

  const r = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!r.ok) return null;
  const j = await r.json();
  const feat = j?.features?.[0];
  const coords = feat?.geometry?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) return [coords[0], coords[1]];
  return null;
}

function nearestNeighbor(dist: number[][], start = 0): number[] {
  const n = dist.length;
  const visited = Array(n).fill(false);
  const tour = [start];
  visited[start] = true;

  for (let step = 1; step < n; step++) {
    const last = tour[tour.length - 1];
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited[j] && dist[last][j] < bestD) {
        bestD = dist[last][j];
        best = j;
      }
    }
    tour.push(best);
    visited[best] = true;
  }
  return tour;
}

// Pequena melhoria: 2-opt (uma passada)
function twoOptOnce(dist: number[][], path: number[]): number[] {
  const n = path.length;
  let improved = false;
  let bestPath = path.slice();
  let bestGain = 0;

  // Não fecha ciclo; é rota aberta: [0 -> ... -> fim]
  function segCost(a: number, b: number) { return dist[a][b]; }

  for (let i = 1; i < n - 2; i++) {
    for (let k = i + 1; k < n - 1; k++) {
      const a = path[i - 1], b = path[i];
      const c = path[k], d = path[k + 1];
      const before = segCost(a, b) + segCost(c, d);
      const after  = segCost(a, c) + segCost(b, d);
      const gain = before - after;
      if (gain > 1e-6) {
        const newPath = bestPath.slice();
        // inverte trecho [i..k]
        while (i < k) {
          const tmp = newPath[i];
          newPath[i] = newPath[k];
          newPath[k] = tmp;
          i++; k--;
        }
        bestPath = newPath;
        bestGain += gain;
        improved = true;
        break;
      }
    }
    if (improved) break;
  }
  return bestPath;
}

function totalKmForPath(dist: number[][], path: number[]): number {
  let s = 0;
  for (let i = 0; i < path.length - 1; i++) {
    s += dist[path[i]][path[i + 1]];
  }
  return s / 1000; // dist está em metros -> km
}

export async function POST(req: NextRequest) {
  try {
    const key = process.env.ORS_API_KEY;
    if (!key) {
      return NextResponse.json({ error: 'Falta ORS_API_KEY no .env' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const origin: string = body.origin?.toString() ?? '';
    const destinos: string[] = Array.isArray(body.destinos) ? body.destinos : [];

    if (!origin.trim() || destinos.length === 0) {
      return NextResponse.json({ error: 'Informe origin e ao menos 1 destino.' }, { status: 400 });
    }

    // 1) Geocode
    const originCoord = await geocodeOne(origin, key);
    if (!originCoord) {
      return NextResponse.json({ error: `Não consegui geocodificar a origem: "${origin}"` }, { status: 400 });
    }
    const destCoords: Array<Coord | null> = await Promise.all(destinos.map(d => geocodeOne(d, key)));
    if (destCoords.some(c => !c)) {
      const falhas = destCoords.map((c, i) => (!c ? destinos[i] : null)).filter(Boolean);
      return NextResponse.json({ error: 'Alguns destinos não foram encontrados.', detalhes: falhas }, { status: 400 });
    }

    // 2) ORS Matrix all-to-all
    // locations: [origin, ...destinations]
    const locations: Coord[] = [originCoord, ...(destCoords as Coord[])]; // [ [lon,lat], ... ]
    const N = locations.length;
    const idxAll = Array.from({ length: N }, (_, i) => i);

    const matrixResp = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
      method: 'POST',
      headers: { 'Authorization': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations,
        sources: idxAll,
        destinations: idxAll,
        metrics: ['distance', 'duration'],
        radiuses: Array(N).fill(5000), // snap para estrada num raio de 5km
      }),
      next: { revalidate: 0 }
    });
    if (!matrixResp.ok) {
      const t = await matrixResp.text();
      return NextResponse.json({ error: 'Falha na ORS Matrix', detalhes: t }, { status: 502 });
    }
    const m = await matrixResp.json();
    const distances: number[][] = m?.distances; // metros
    const durations: number[][] = m?.durations; // segundos
    if (!distances || !durations) {
      return NextResponse.json({ error: 'Resposta inesperada da ORS Matrix', detalhes: m }, { status: 502 });
    }

    // 3) Heurística TSP (rota ABERTA: começa na origem [0], visita todos os destinos 1..N-1)
    let path = nearestNeighbor(distances, 0);
    path = twoOptOnce(distances, path); // uma passada de melhoria

    // 4) Monta resposta: ordem de destinos (sem repetir origem), km por trecho e total
    const orderedStops = path.slice(1).map(i => destinos[i - 1]); // i>=1 mapeia para destino[i-1]
    const legs = [];
    let total_km = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const km = Number((distances[a][b] / 1000).toFixed(2));
      const dur_min = Math.round(durations[a][b] / 60);
      total_km += km;
      legs.push({
        from: i === 0 ? origin : destinos[a - 1],
        to: destinos[b - 1] ?? '(fim)',
        km, dur_min
      });
    }

    return NextResponse.json({
      origin,
      orderedStops, // destinos na ordem otimizada
      legs,
      total_km: Number(total_km.toFixed(2)),
      indices: path, // [0, ...] (útil para depurar)
    });
  } catch (e) {
    console.error('POST /api/planejamento/otimizar error:', e);
    return NextResponse.json({ error: 'Falha ao otimizar rota' }, { status: 500 });
  }
}
