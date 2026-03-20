import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  params: Promise<{ id: string }>; // Next 15
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * GET /api/paradas/[id]/eventos
 * Query:
 *  - limit?: number (1..500) default 200
 *
 * Busca scanEvent por etiqueta: "PARADA:<paradaId>"
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const paradaId = String(id || '').trim();
    if (!paradaId) return json({ ok: false, error: 'Parâmetro id é obrigatório.' }, 400);

    const { searchParams } = new URL(req.url);
    const limitNum = Number(searchParams.get('limit') || '200');
    const limit = Number.isFinite(limitNum) ? Math.max(1, Math.min(500, limitNum)) : 200;

    const etiqueta = `PARADA:${paradaId}`;

    const eventos = await prisma.scanEvent.findMany({
      where: { etiqueta },
      orderBy: { createdAt: 'desc' as any },
      take: limit,
      select: {
        id: true,
        etiqueta: true,
        status: true,
        note: true,
        createdAt: true as any,
      },
    });

    return json({ ok: true, paradaId, etiqueta, limit, eventos });
  } catch (e: any) {
    console.error('GET /api/paradas/[id]/eventos error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno.' }, 500);
  }
}
