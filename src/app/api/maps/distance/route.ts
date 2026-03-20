import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/maps/distance
 * body: { origins: string[], destinations: string[] }
 *
 * Implementação 100% gratuita usando OpenRouteService:
 * - Geocoding (para transformar texto -> [lon,lat])
 * - Matrix (driving-car) para distâncias/durações
 */
export async function POST(req: NextRequest) {
  try {
    const key = process.env.ORS_API_KEY;
    if (!key) {
      return NextResponse.json({ error: 'Falta ORS_API_KEY no .env' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const origins: string[] = body.origins ?? [];
    const destinations: string[] = body.destinations ?? [];

    if (!origins.length || !destinations.length) {
      return NextResponse.json({ error: 'Informe origins e destinations (arrays de endereços)' }, { status: 400 });
    }

    // 1) Geocoding ORS (pega só o 1º resultado de cada endereço)
    async function geocodeOne(q: string): Promise<[number, number] | null> {
      const url = new URL('https://api.openrouteservice.org/geocode/search');
      url.searchParams.set('api_key', key!);
      url.searchParams.set('text', q);
      url.searchParams.set('size', '1');
      url.searchParams.set('boundary.country', 'BR'); // ajuda a priorizar Brasil

      const r = await fetch(url.toString(), { next: { revalidate: 0 } });
      if (!r.ok) return null;
      const j = await r.json();
      const feat = j?.features?.[0];
      const coords = feat?.geometry?.coordinates;
      // ORS retorna [lon, lat]
      if (Array.isArray(coords) && coords.length >= 2) return [coords[0], coords[1]];
      return null;
    }

    // Geocodifica 1 origem (a primeira) e N destinos
    const originStr = origins[0];
    const originCoord = await geocodeOne(originStr);
    if (!originCoord) {
      return NextResponse.json({ error: `Não consegui geocodificar a origem: "${originStr}"` }, { status: 400 });
    }

    const destCoords: Array<[number, number] | null> = await Promise.all(
      destinations.map(d => geocodeOne(d))
    );

    if (destCoords.some(c => !c)) {
      const falhas = destCoords.map((c, i) => (!c ? destinations[i] : null)).filter(Boolean);
      return NextResponse.json({ error: 'Alguns destinos não foram encontrados.', detalhes: falhas }, { status: 400 });
    }

    // 2) Matrix ORS: locations = [origin, ...destinations]
    const allLocations = [originCoord, ...(destCoords as [number, number][])]; // [ [lon,lat], ... ]
    // sources: [0] => a origem é o índice 0
    // destinations: [1..n] => destinos são os próximos índices
    const destIndexes = Array.from({ length: destinations.length }, (_, i) => i + 1);

    const matrixResp = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
      method: 'POST',
      headers: {
        'Authorization': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        locations: allLocations,
        sources: [0],
        destinations: destIndexes,
        metrics: ['distance', 'duration'], // distância em METROS, duração em SEGUNDOS
      }),
      next: { revalidate: 0 }
    });

    if (!matrixResp.ok) {
      const txt = await matrixResp.text();
      return NextResponse.json({ error: 'Falha na ORS Matrix', detalhes: txt }, { status: 502 });
    }

    const matrixJson = await matrixResp.json();
    const distances = matrixJson?.distances?.[0] as number[] | undefined; // metros
    const durations = matrixJson?.durations?.[0] as number[] | undefined; // segundos

    if (!distances || !durations) {
      return NextResponse.json({ error: 'Resposta inesperada da ORS Matrix', detalhes: matrixJson }, { status: 502 });
    }

    // Monta resposta no formato usado pela sua UI
    let total_km = 0;
    const stops = destIndexes.map((_, i) => {
      const km = Number((distances[i] / 1000).toFixed(2)); // metros -> km
      const dur_min = Math.round(durations[i] / 60);       // segundos -> minutos
      total_km += km;
      return { to: destinations[i], km, dur_min };
    });

    return NextResponse.json({
      origin: originStr,
      stops,
      total_km: Number(total_km.toFixed(2)),
    });
  } catch (e) {
    console.error('POST /api/maps/distance (ORS) error:', e);
    return NextResponse.json({ error: 'Falha ao calcular distância (ORS)' }, { status: 500 });
  }
}
