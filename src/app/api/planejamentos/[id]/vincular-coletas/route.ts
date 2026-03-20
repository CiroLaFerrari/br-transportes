import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

function jserr(e: any) {
  return { name: e?.name, message: e?.message, code: e?.code, meta: e?.meta };
}

/** Geocodifica "Cidade, UF, Brasil" usando Nominatim + GeoCache */
async function geocodeCidadeUf(cidade: string, uf: string | null | undefined) {
  const labelParts = [cidade, uf, 'Brasil'].filter(Boolean) as string[];
  const query = labelParts.join(', ');
  const norm = query.trim().toLowerCase();

  // 1) tenta cache
  const cached = await prisma.geoCache.findFirst({
    where: { norm },
  });

  if (cached) {
    await prisma.geoCache.update({
      where: { id: cached.id },
      data: { hits: cached.hits + 1, lastHitAt: new Date() },
    });
    return { lon: cached.lon, lat: cached.lat };
  }

  // 2) chama Nominatim
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
    encodeURIComponent(query);

  const resp = await fetch(url, {
    headers: {
      // Nominatim exige um User-Agent decente
      'User-Agent': 'br-transportes-dev/1.0 (rota-coletas)',
    },
  });

  if (!resp.ok) {
    throw new Error(`geocode HTTP ${resp.status}`);
  }

  const json: any = await resp.json();
  if (!Array.isArray(json) || json.length === 0) {
    throw new Error('geocode sem resultados');
  }

  const first = json[0];
  const lon = Number(first.lon);
  const lat = Number(first.lat);

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error('geocode retornou coordenadas inválidas');
  }

  await prisma.geoCache.create({
    data: {
      query,
      norm,
      lon,
      lat,
    },
  });

  return { lon, lat };
}

/**
 * POST /api/planejamentos/:id/vincular-coletas
 * body: { coletaIds: string[] }
 *
 * - Garante Planejamento
 * - Limpa Paradas existentes
 * - Cria novas Paradas com:
 *   label = "Cidade / UF"
 *   lon/lat = geocode(Cidade, UF, Brasil)
 *   ordem = ordem fornecida em coletaIds
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id: planId } = await ctx.params;

    const body = await req.json().catch(() => ({}));
    const coletaIds: string[] = Array.isArray(body?.coletaIds) ? body.coletaIds : [];
    if (!coletaIds.length) {
      return NextResponse.json(
        { error: 'Informe coletaIds (array de strings)' },
        { status: 400 },
      );
    }

    // Garante que o planejamento existe
    const plan = await prisma.planejamento.findUnique({
      where: { id: planId },
      select: { id: true },
    });

    if (!plan) {
      return NextResponse.json(
        { error: 'Planejamento não encontrado.' },
        { status: 404 },
      );
    }

    // Busca coletas
    const coletas = await prisma.coleta.findMany({
      where: { id: { in: coletaIds } },
      select: {
        id: true,
        cidade: true,
        uf: true,
      },
    });

    const byId = new Map(coletas.map((c) => [c.id, c]));
    const faltantes = coletaIds.filter((id) => !byId.has(id));
    if (faltantes.length) {
      return NextResponse.json(
        { error: 'Algumas coletas não existem', faltantes },
        { status: 400 },
      );
    }

    // Limpa paradas antigas
    await prisma.parada.deleteMany({ where: { planejamentoId: planId } });

    const criadas = [];

    for (let i = 0; i < coletaIds.length; i++) {
      const coletaId = coletaIds[i];
      const c = byId.get(coletaId)!;

      const labelBase = [c.cidade, c.uf].filter(Boolean).join(' / ');
      const label = labelBase || `Parada ${i + 1}`;

      let lon = 0;
      let lat = 0;

      try {
        if (c.cidade) {
          const g = await geocodeCidadeUf(c.cidade, c.uf);
          lon = g.lon;
          lat = g.lat;
        }
      } catch (ge: any) {
        console.error(
          '[vincular-coletas] falha geocode',
          c.cidade,
          c.uf,
          ge?.message,
        );
        // fallback = 0,0 (vai ficar fora do mapa, mas não quebra)
      }

      const parada = await prisma.parada.create({
        data: {
          planejamentoId: planId,
          coletaId,
          ordem: i + 1,
          label,
          lon,
          lat,
        },
      });

      criadas.push(parada);
    }

    return NextResponse.json({
      ok: true,
      planejamentoId: planId,
      paradasCriadas: criadas,
    });
  } catch (e: any) {
    console.error('[vincular-coletas] error:', e);
    return NextResponse.json(
      { error: 'Falha ao vincular coletas', detail: jserr(e) },
      { status: 500 },
    );
  }
}
