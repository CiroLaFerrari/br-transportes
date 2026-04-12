// src/app/api/maps/route/route.ts
import { NextRequest, NextResponse } from 'next/server';

type Coord = [number, number]; // [lon, lat]

// UF -> nome completo (normalização leve)
const UF_FULL: Record<string, string> = {
  AC:'Acre', AL:'Alagoas', AM:'Amazonas', AP:'Amapá', BA:'Bahia', CE:'Ceará',
  DF:'Distrito Federal', ES:'Espírito Santo', GO:'Goiás', MA:'Maranhão',
  MG:'Minas Gerais', MS:'Mato Grosso do Sul', MT:'Mato Grosso',
  PA:'Pará', PB:'Paraíba', PE:'Pernambuco', PI:'Piauí', PR:'Paraná',
  RJ:'Rio de Janeiro', RN:'Rio Grande do Norte', RO:'Rondônia', RR:'Roraima',
  RS:'Rio Grande do Sul', SC:'Santa Catarina', SE:'Sergipe', SP:'São Paulo',
  TO:'Tocantins',
};

function deaccent(s: string) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function normalizePlaceStrict(s: string) {
  if (!s) return '';
  let t = s.trim().replace(/\s+/g, ' ');
  t = t.replace(/\s*\/\s*/g, ', ');
  const ufMatch = t.match(/,\s*([A-Z]{2})(?:\s*|$)/i);
  if (ufMatch) {
    const uf = ufMatch[1].toUpperCase();
    const full = UF_FULL[uf];
    if (full) t = t.replace(/,\s*[A-Z]{2}\s*$/i, `, ${full}`);
  }
  if (!/brasil$/i.test(t)) t = `${t}, Brasil`;
  return t;
}

function haversineKm(a: Coord, b: Coord) {
  const R = 6371;
  const toRad = (x: number) => x * Math.PI / 180;
  const [lon1, lat1] = a; const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const la1 = toRad(lat1); const la2 = toRad(lat2);
  const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Geocode “esperto”: tenta original; se falhar, tenta sem acento (sem cache)
async function geocodeSmart(q: string, key: string, focus?: Coord, circleKm = 300): Promise<Coord | null> {
  const norm = normalizePlaceStrict(q);
  const tryOnce = async (text: string) => {
    const url = new URL('https://api.openrouteservice.org/geocode/search');
    url.searchParams.set('api_key', key);
    url.searchParams.set('text', text);
    url.searchParams.set('size', '1');
    url.searchParams.set('boundary.country', 'BR');
    if (focus) {
      url.searchParams.set('focus.point.lon', String(focus[0]));
      url.searchParams.set('focus.point.lat', String(focus[1]));
      url.searchParams.set('boundary.circle.lon', String(focus[0]));
      url.searchParams.set('boundary.circle.lat', String(focus[1]));
      url.searchParams.set('boundary.circle.radius', String(circleKm * 1000));
    }
    const r = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!r.ok) return null;
    const j = await r.json();
    const coords = j?.features?.[0]?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) return [coords[0], coords[1]] as Coord;
    return null;
  };

  let c = await tryOnce(norm);
  if (c) return c;
  const noAccent = deaccent(norm);
  if (noAccent !== norm) c = await tryOnce(noAccent);
  return c;
}

// Directions ORS: auto-detecta unidade (km vs metros) de forma robusta
async function directionsORS(a: Coord, b: Coord, key: string, labelA?: string, labelB?: string) {
  const url = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      coordinates: [a, b],
      instructions: false,
      units: 'km',
      language: 'pt',
      radiuses: [5000, 5000], // snap para estrada num raio de 5km (padrão ORS: 350m)
    }),
    next: { revalidate: 0 }
  });
  if (!resp.ok) {
    const t = await resp.text();
    const trecho = labelA && labelB ? ` (trecho: ${labelA} → ${labelB})` : '';
    // Parse ORS error for user-friendly message
    try {
      const errObj = JSON.parse(t);
      if (errObj?.error?.code === 2010) {
        throw new Error(`Não foi possível encontrar uma estrada próxima ao ponto geocodificado${trecho}. Tente especificar o endereço de forma mais precisa.`);
      }
    } catch (parseErr: any) {
      if (parseErr?.message?.includes('estrada')) throw parseErr;
    }
    throw new Error(`Falha ao calcular rota${trecho}: ${t}`);
  }
  const geo = await resp.json();
  const feat = geo?.features?.[0];
  const sum = feat?.properties?.summary;

  const rawDist = Number(sum?.distance ?? 0);   // pode vir em km ou metros dependendo da versão ORS
  const seconds = Number(sum?.duration ?? 0);

  // Detecção de unidade robusta:
  // Comparamos rawDist com a distância haversine (que sabemos estar em km).
  // Se rawDist/haversine > 10, ORS retornou em metros → divide por 1000.
  // Se rawDist/haversine <= 10, ORS retornou em km → usa direto.
  const great = haversineKm(a, b);
  const ratio = great > 0 ? rawDist / great : 0;
  const isMeters = ratio > 10; // ex.: 2.630.000 m / 2100 km = 1252 → metros; 2630 km / 2100 km = 1.25 → km
  const km = isMeters ? Number((rawDist / 1000).toFixed(2)) : Number(rawDist.toFixed(2));
  const dur_min = Math.round(seconds / 60);

  // Sanidade (rota não pode ser muito maior que a linha reta)
  if (great > 0 && km / great > 5) {
    throw new Error(`Distância inconsistente (km=${km}, haversine=${great.toFixed(2)}, raw=${rawDist}, ratio=${ratio.toFixed(1)})`);
  }

  // Log para diagnóstico
  console.log('[ORS raw]', { rawDist, great: great.toFixed(1), ratio: ratio.toFixed(2), unit: isMeters ? 'meters→km' : 'km', seconds });

  return { geometry: feat.geometry, km, dur_min, rawDist, seconds, unit: isMeters ? 'm' : 'km' };
}

export async function POST(req: NextRequest) {
  try {
    const key = process.env.ORS_API_KEY;
    if (!key) return NextResponse.json({ error: 'Falta ORS_API_KEY no .env' }, { status: 500 });

    const body = await req.json().catch(()=> ({}));
    const rawPlaces: string[] = Array.isArray(body.places) ? body.places : [];
    if (rawPlaces.length < 2) {
      return NextResponse.json({ error: 'Envie ao menos origem e 1 destino em places[]' }, { status: 400 });
    }

    // 1) origem
    const origin = await geocodeSmart(rawPlaces[0], key);
    if (!origin) return NextResponse.json({ error: `Falha geocode origem: "${rawPlaces[0]}"` }, { status: 400 });

    const norms: string[] = [normalizePlaceStrict(rawPlaces[0])];
    const coords: Coord[] = [origin];

    // 2) destinos com foco na origem
    for (let i = 1; i < rawPlaces.length; i++) {
      const c = await geocodeSmart(rawPlaces[i], key, origin);
      if (!c) return NextResponse.json({ error: `Falha geocode destino: "${normalizePlaceStrict(rawPlaces[i])}"` }, { status: 400 });
      norms.push(normalizePlaceStrict(rawPlaces[i]));
      coords.push(c);
    }

    // 3) legs (sem cache)
    const features: any[] = [];
    const legs: Array<{ from: string; to: string; km: number; dur_min: number; _raw: number; _unit: string; _sec: number }> = [];
    let total_km = 0;
    let total_dur_min = 0;

    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i], b = coords[i+1];
      const leg = await directionsORS(a, b, key, norms[i], norms[i+1]);

      features.push({
        type: 'Feature',
        properties: { from: norms[i], to: norms[i+1], km: leg.km, dur_min: leg.dur_min, idx: i + 1 },
        geometry: leg.geometry
      });

      legs.push({ from: norms[i], to: norms[i+1], km: leg.km, dur_min: leg.dur_min, _raw: leg.rawDist, _unit: leg.unit, _sec: leg.seconds });

      total_km += leg.km;
      total_dur_min += leg.dur_min;
    }

    const fc = { type: 'FeatureCollection', features };
    const pts = norms.map((label, i) => ({ label, lon: coords[i][0], lat: coords[i][1] }));

    return NextResponse.json({
      points: pts,
      legs,
      geojson: fc,
      total_km: Number(total_km.toFixed(2)),
      total_dur_min,
      debug: { autoUnitDetection: true, noCache: true }
    });
  } catch (e: any) {
    console.error('POST /api/maps/route error:', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Falha ao gerar rota (ORS)' }, { status: 500 });
  }
}
