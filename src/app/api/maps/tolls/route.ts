import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/maps/tolls
 *
 * Estima pedágios usando a Google Maps Routes API v2 (computeRoutes).
 * Body: { points: [{ lat: number, lon: number, label?: string }] }
 *
 * Retorna: { ok: true, tolls: [{ name: string, price: number }], total: number, currency: string }
 *
 * Requer env GOOGLE_MAPS_API_KEY com Routes API habilitada.
 * Caso a API key não esteja configurada, usa estimativa heurística baseada na distância.
 */

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

interface Point {
  lat: number;
  lon: number;
  label?: string;
}

interface TollInfo {
  name: string;
  price: number;
}

// ===== Google Maps Routes API v2 =====
async function estimateWithGoogle(points: Point[]): Promise<{ tolls: TollInfo[]; total: number; currency: string; method: string }> {
  const origin = points[0];
  const destination = points[points.length - 1];
  const intermediates = points.slice(1, -1);

  const body: any = {
    origin: {
      location: {
        latLng: { latitude: origin.lat, longitude: origin.lon },
      },
    },
    destination: {
      location: {
        latLng: { latitude: destination.lat, longitude: destination.lon },
      },
    },
    travelMode: 'DRIVE',
    routeModifiers: {
      vehicleInfo: {
        emissionType: 'DIESEL',
      },
      tollPasses: [],
    },
    extraComputations: ['TOLLS'],
    routingPreference: 'TRAFFIC_AWARE',
  };

  if (intermediates.length > 0) {
    body.intermediates = intermediates.map((p) => ({
      location: {
        latLng: { latitude: p.lat, longitude: p.lon },
      },
    }));
  }

  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'routes.travelAdvisory.tollInfo,routes.legs.travelAdvisory.tollInfo,routes.distanceMeters,routes.duration',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Routes API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) throw new Error('Nenhuma rota encontrada pelo Google Maps');

  const tolls: TollInfo[] = [];

  // Extract tolls from route-level advisory
  const routeTollInfo = route.travelAdvisory?.tollInfo;
  if (routeTollInfo?.estimatedPrice) {
    for (const price of routeTollInfo.estimatedPrice) {
      const val = parseFloat(price.units || '0') + parseFloat(price.nanos || '0') / 1e9;
      tolls.push({
        name: `Pedágio total (${price.currencyCode || 'BRL'})`,
        price: Math.round(val * 100) / 100,
      });
    }
  }

  // Also check per-leg toll info for more detail
  if (route.legs) {
    for (let i = 0; i < route.legs.length; i++) {
      const legToll = route.legs[i].travelAdvisory?.tollInfo;
      if (legToll?.estimatedPrice) {
        for (const price of legToll.estimatedPrice) {
          const val = parseFloat(price.units || '0') + parseFloat(price.nanos || '0') / 1e9;
          if (val > 0) {
            const fromLabel = i === 0 ? (points[0].label || 'Origem') : (points[i].label || `Parada ${i}`);
            const toLabel = points[i + 1]?.label || `Parada ${i + 1}`;
            tolls.push({
              name: `${fromLabel} → ${toLabel}`,
              price: Math.round(val * 100) / 100,
            });
          }
        }
      }
    }
  }

  // If we got route-level total, use that; otherwise sum per-leg
  const total = routeTollInfo?.estimatedPrice
    ? tolls[0]?.price || 0
    : tolls.reduce((s, t) => s + t.price, 0);

  // If we got both route-level and per-leg, return only per-leg detail (more useful)
  const detailedTolls = tolls.length > 1 ? tolls.slice(1) : tolls;

  return {
    tolls: detailedTolls.length > 0 ? detailedTolls : tolls,
    total: Math.round(total * 100) / 100,
    currency: 'BRL',
    method: 'google_routes_api',
  };
}

// ===== Estimativa heurística (fallback sem Google API key) =====
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function estimateHeuristic(points: Point[], totalKm?: number): { tolls: TollInfo[]; total: number; currency: string; method: string } {
  // Estimate based on Brazilian average toll costs:
  // Average toll booth ~ R$ 8-12 per booth
  // Average spacing ~ 80-120 km between toll booths on major highways
  // We use: 1 toll every ~100km, average R$ 10.50 per booth for 2-axle vehicles

  let km = totalKm || 0;
  if (!km) {
    for (let i = 1; i < points.length; i++) {
      km += haversineKm(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    }
    km *= 1.3; // haversine → road distance correction factor
  }

  const avgTollPerBooth = 10.5; // R$ average
  const avgSpacingKm = 100; // km between tolls
  const estimatedBooths = Math.max(0, Math.floor(km / avgSpacingKm));
  const total = Math.round(estimatedBooths * avgTollPerBooth * 100) / 100;

  const tolls: TollInfo[] = [];
  if (estimatedBooths > 0) {
    tolls.push({
      name: `Estimativa: ~${estimatedBooths} praças de pedágio (${Math.round(km)} km)`,
      price: total,
    });
  }

  return {
    tolls,
    total,
    currency: 'BRL',
    method: 'heuristic',
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { points, totalKm } = body as { points: Point[]; totalKm?: number };

    if (!Array.isArray(points) || points.length < 2) {
      return NextResponse.json({ error: 'Envie ao menos 2 pontos com { lat, lon }' }, { status: 400 });
    }

    // Validate coordinates
    for (const p of points) {
      if (typeof p.lat !== 'number' || typeof p.lon !== 'number') {
        return NextResponse.json({ error: 'Cada ponto deve ter lat e lon numéricos' }, { status: 400 });
      }
    }

    let result;

    if (GOOGLE_MAPS_API_KEY) {
      try {
        result = await estimateWithGoogle(points);
      } catch (err: any) {
        console.error('Google Routes API failed, falling back to heuristic:', err.message);
        result = estimateHeuristic(points, totalKm);
        result.method = 'heuristic_fallback';
      }
    } else {
      result = estimateHeuristic(points, totalKm);
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: 'Falha ao estimar pedágios', detail: String(e?.message ?? e) }, { status: 500 });
  }
}
