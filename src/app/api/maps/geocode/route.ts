import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

type Coord = [number, number];

// Normaliza "Cidade/UF" -> "Cidade, UF, Brasil"
function normalizePlace(s: string) {
  const t = (s || '').trim()
    .replace(/\s*\/\s*/g, ', ')
    .replace(/\s+/g, ' ');
  return /brasil/i.test(t) ? t : `${t}, Brasil`;
}

async function geocodeORS(q: string, key: string, focus?: Coord, circleKm?: number): Promise<Coord | null> {
  const url = new URL('https://api.openrouteservice.org/geocode/search');
  url.searchParams.set('api_key', key);
  url.searchParams.set('text', q);
  url.searchParams.set('size', '1');
  url.searchParams.set('boundary.country', 'BR');
  if (focus) {
    url.searchParams.set('focus.point.lon', String(focus[0]));
    url.searchParams.set('focus.point.lat', String(focus[1]));
  }
  if (focus && circleKm && circleKm > 0) {
    url.searchParams.set('boundary.circle.lon', String(focus[0]));
    url.searchParams.set('boundary.circle.lat', String(focus[1]));
    url.searchParams.set('boundary.circle.radius', String(circleKm * 1000));
  }

  const r = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!r.ok) return null;
  const j = await r.json();
  const coords = j?.features?.[0]?.geometry?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) return [coords[0], coords[1]];
  return null;
}

async function geocodeWithCache(raw: string, key: string, opts?: { focus?: Coord; circleKm?: number }) {
  const norm = normalizePlace(raw);

  // 1) tenta cache
  const cached = await prisma.geoCache.findUnique({ where: { norm } });
  if (cached) {
    await prisma.geoCache.update({
      where: { norm },
      data: { hits: { increment: 1 }, lastHitAt: new Date() }
    });
    return { lon: cached.lon, lat: cached.lat, fromCache: true };
  }

  // 2) chama ORS
  const coord = await geocodeORS(norm, key, opts?.focus, opts?.circleKm);
  if (!coord) return null;

  // 3) salva no cache
  await prisma.geoCache.create({
    data: {
      query: raw,
      norm,
      lon: coord[0],
      lat: coord[1],
    }
  });

  return { lon: coord[0], lat: coord[1], fromCache: false };
}

/**
 * POST /api/maps/geocode
 * body:
 *   - places: string[] (obrigatório)
 *   - origin?: string   (opcional, para viés)
 *   - circleKm?: number (opcional, padrão 700)
 */
export async function POST(req: NextRequest) {
  try {
    const key = process.env.ORS_API_KEY;
    if (!key) {
      return NextResponse.json({ error: 'Falta ORS_API_KEY no .env' }, { status: 500 });
    }
    const body = await req.json().catch(()=> ({}));
    const places: string[] = Array.isArray(body.places) ? body.places : [];
    const originStr: string | undefined = body.origin ? String(body.origin) : undefined;
    const circleKm: number = typeof body.circleKm === 'number' ? body.circleKm : 700;

    if (!places.length) {
      return NextResponse.json({ error: 'Envie places: string[]' }, { status: 400 });
    }

    // foco na origem (se enviado)
    let focus: Coord | undefined;
    if (originStr) {
      const origin = await geocodeWithCache(originStr, key);
      if (!origin) return NextResponse.json({ error: `Não consegui geocodificar a origem: "${originStr}"` }, { status: 400 });
      focus = [origin.lon, origin.lat];
    }

    const results = await Promise.all(
      places.map(p => geocodeWithCache(p, key, { focus, circleKm }))
    );

    if (results.some(r => !r)) {
      const falhas = results.map((r, i) => (!r ? places[i] : null)).filter(Boolean);
      return NextResponse.json({ error: 'Alguns endereços não foram encontrados.', detalhes: falhas }, { status: 400 });
    }

    const points = places.map((label, i) => ({
      label: normalizePlace(label),
      lon: results[i]!.lon,
      lat: results[i]!.lat,
      fromCache: (results[i] as any).fromCache ?? false,
    }));

    return NextResponse.json({ points }, { status: 200 });
  } catch (e) {
    console.error('POST /api/maps/geocode error:', e);
    return NextResponse.json({ error: 'Falha no geocoding' }, { status: 500 });
  }
}
