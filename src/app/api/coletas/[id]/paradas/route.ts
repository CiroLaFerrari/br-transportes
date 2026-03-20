import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * GET /api/coletas/:id/paradas
 * Lista as paradas vinculadas à coleta.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const coletaId = String(id || '').trim();
    if (!coletaId) return json({ ok: false, error: 'Coleta ID inválido.' }, 400);

    const list = await prisma.parada.findMany({
      where: { coletaId },
      orderBy: { ordem: 'asc' },
      select: {
        id: true,
        ordem: true,
        label: true,
        lat: true,
        lon: true,
        statusExec: true,
        checkinAt: true,
        checkoutAt: true,
        kmTrecho: true,
        durMinTrecho: true,
        planejamentoId: true,
        rotaId: true,
        createdAt: true,
      },
    });

    return json({ ok: true, total: list.length, list });
  } catch (e: any) {
    console.error('GET /api/coletas/[id]/paradas error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno' }, 500);
  }
}

/**
 * POST /api/coletas/:id/paradas
 * Body:
 * {
 *   label?: string
 *   lat: number
 *   lon: number
 * }
 *
 * Cria uma parada PENDENTE para a coleta.
 * ordem é calculada automaticamente (última ordem + 1).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await ctx.params;
    const coletaId = String(idParam || '').trim();
    if (!coletaId) return json({ ok: false, error: 'Coleta ID inválido.' }, 400);

    const body = await req.json().catch(() => null);

    const lat = Number(body?.lat);
    const lon = Number(body?.lon);
    const labelRaw = String(body?.label || '').trim();

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return json({ ok: false, error: 'Informe lat e lon válidos (número).' }, 400);
    }

    const created = await prisma.$transaction(async (tx) => {
      const coleta = await tx.coleta.findUnique({
        where: { id: coletaId },
        select: { id: true, nf: true, cidade: true, uf: true },
      });
      if (!coleta) throw new Error('Coleta não encontrada.');

      const last = await tx.parada.findFirst({
        where: { coletaId },
        orderBy: { ordem: 'desc' },
        select: { ordem: true },
      });

      const ordem = (last?.ordem ?? 0) + 1;
      const label =
        labelRaw ||
        `${coleta.cidade || 'Destino'} - ${coleta.uf || ''} (NF ${coleta.nf || ''})`.trim();

      const parada = await tx.parada.create({
        data: {
          coletaId,
          ordem,
          label,
          lat,
          lon,
          statusExec: 'PENDENTE',
        },
        select: {
          id: true,
          ordem: true,
          label: true,
          lat: true,
          lon: true,
          statusExec: true,
          checkinAt: true,
          checkoutAt: true,
          coletaId: true,
        },
      });

      return parada;
    });

    return json({ ok: true, created }, 201);
  } catch (e: any) {
    console.error('POST /api/coletas/[id]/paradas error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno' }, 500);
  }
}
