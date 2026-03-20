import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  params: Promise<{ id: string }>; // Next 15
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * GET /api/coletas/[id]/eventos
 * Query:
 *  - limit?: number (1..200) default 50
 *
 * Retorna eventos do scanEvent relacionados à coleta via etiqueta "COLETA:<id>"
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const coletaId = String(id || '').trim();
    if (!coletaId) return json({ ok: false, error: 'Parâmetro id é obrigatório.' }, 400);

    const { searchParams } = new URL(req.url);
    const limitNum = Number(searchParams.get('limit') || '50');
    const limit = Number.isFinite(limitNum) ? Math.max(1, Math.min(200, limitNum)) : 50;

    // etiqueta padrão usada no POST /api/coletas/[id]/acao
    const etiqueta = `COLETA:${coletaId}`;

    // tenta primeiro por etiqueta exata (padrão)
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

    return json({ ok: true, coletaId, etiqueta, limit, eventos });
  } catch (e: any) {
    console.error('GET /api/coletas/[id]/eventos error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno.' }, 500);
  }
}
