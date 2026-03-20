import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * GET /api/scan/timeline?rotaId=...&limit=50
 *
 * Retorna eventos recentes (scanEvent) relacionados a:
 * - PARADA:<paradaId> (todas as paradas da rota)
 * - COLETA:<coletaId> (todas as coletas da rota)
 *
 * Também tenta enriquecer com:
 * - paradaId / coletaId extraídos da etiqueta
 * - nf / label (quando possível)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rotaId = String(searchParams.get('rotaId') || '').trim() || null;

    const limitNum = Number(searchParams.get('limit') || '50');
    const limit = Number.isFinite(limitNum) ? Math.max(1, Math.min(200, limitNum)) : 50;

    if (!rotaId) {
      return json({ ok: false, error: 'rotaId é obrigatório.' }, 400);
    }

    const rota = await prisma.rota.findUnique({
      where: { id: rotaId },
      select: {
        id: true,
        dataRota: true,
        status: true,
        paradas: {
          select: {
            id: true,
            label: true,
            ordem: true,
            coletaId: true,
            Coleta: { select: { id: true, nf: true } },
          },
        },
      },
    });

    if (!rota) return json({ ok: false, error: 'Rota não encontrada.' }, 404);

    const paradas = rota.paradas || [];
    const paradaIds = Array.from(new Set(paradas.map((p) => p.id)));
    const coletaIds = Array.from(new Set(paradas.map((p) => p.coletaId)));

    const etiquetas: string[] = [
      ...paradaIds.map((id) => `PARADA:${id}`),
      ...coletaIds.map((id) => `COLETA:${id}`),
    ];

    if (etiquetas.length === 0) {
      return json({
        ok: true,
        rota: { id: rota.id, dataRota: rota.dataRota, status: rota.status },
        limit,
        timeline: [],
      });
    }

    const eventos = await prisma.scanEvent.findMany({
      where: { etiqueta: { in: etiquetas } },
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

    // índices pra enriquecer
    const paradaById = new Map(paradas.map((p) => [p.id, p]));
    const coletaById = new Map(paradas.map((p) => [p.coletaId, p.Coleta]).filter((x) => !!x[1]) as any);

    const timeline = eventos.map((ev) => {
      const etq = String(ev.etiqueta || '');
      let type: 'PARADA' | 'COLETA' | 'OUTRO' = 'OUTRO';
      let paradaId: string | null = null;
      let coletaId: string | null = null;

      if (etq.startsWith('PARADA:')) {
        type = 'PARADA';
        paradaId = etq.substring('PARADA:'.length);
      } else if (etq.startsWith('COLETA:')) {
        type = 'COLETA';
        coletaId = etq.substring('COLETA:'.length);
      }

      const parada = paradaId ? paradaById.get(paradaId) : null;
      const nf = coletaId ? coletaById.get(coletaId)?.nf ?? null : parada?.Coleta?.nf ?? null;

      return {
        id: ev.id,
        createdAt: ev.createdAt,
        status: ev.status,
        note: ev.note ?? null,
        etiqueta: ev.etiqueta,
        type,
        paradaId,
        coletaId,
        paradaLabel: parada?.label ?? null,
        paradaOrdem: (parada as any)?.ordem ?? null,
        nf,
        // links úteis pro front
        href:
          type === 'PARADA' && parada?.coletaId
            ? `/coletas/${parada.coletaId}`
            : type === 'COLETA' && coletaId
              ? `/coletas/${coletaId}`
              : null,
      };
    });

    return json({
      ok: true,
      rota: { id: rota.id, dataRota: rota.dataRota, status: rota.status },
      limit,
      timeline,
    });
  } catch (e: any) {
    console.error('GET /api/scan/timeline error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno.' }, 500);
  }
}
