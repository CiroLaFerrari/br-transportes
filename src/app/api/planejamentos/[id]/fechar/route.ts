import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  params: Promise<{ id: string }>; // Next 15
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function upsertLinha(notesRaw: string, key: string, value: string) {
  const KEY = String(key || '').trim();
  const lines = String(notesRaw || '').split('\n');
  const cleaned = lines.filter((l) => !l.trim().toUpperCase().startsWith(KEY.toUpperCase() + '='));
  if (value !== undefined && value !== null && String(value).trim() !== '') {
    cleaned.unshift(`${KEY}=${String(value).trim()}`);
  }
  return cleaned.join('\n').trim();
}

export async function POST(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const planejamentoId = String(id || '').trim();
    if (!planejamentoId) return json({ ok: false, error: 'planejamentoId ausente' }, 400);

    const plan = await prisma.planejamento.findUnique({
      where: { id: planejamentoId },
      select: { id: true, status: true, notes: true, updatedAt: true },
    });

    if (!plan) return json({ ok: false, error: 'Planejamento não encontrado' }, 404);

    // Se já estiver fechado, é idempotente
    const alreadyClosed = plan.status && plan.status !== 'DRAFT';
    if (alreadyClosed) {
      return json({
        ok: true,
        closed: true,
        status: plan.status,
        message: 'Planejamento já estava fechado (status != DRAFT).',
      });
    }

    const nowIso = new Date().toISOString();
    const notesMerged = upsertLinha(plan.notes || '', 'FECHADO_AT', nowIso);

    const updated = await prisma.planejamento.update({
      where: { id: planejamentoId },
      data: {
        status: 'PLANNED',
        notes: notesMerged,
      } as any,
      select: { id: true, status: true, notes: true, updatedAt: true },
    });

    return json({
      ok: true,
      closed: true,
      status: updated.status,
      updatedAt: updated.updatedAt,
    });
  } catch (e: any) {
    console.error('POST /api/planejamentos/[id]/fechar error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno' }, 500);
  }
}