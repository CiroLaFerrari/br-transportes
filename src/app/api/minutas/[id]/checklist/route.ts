import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  params: Promise<{ id: string }>; // Next 15
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

// ChecklistItemStatus no seu schema: PENDENTE | OK | FALHA
type ItemStatus = 'PENDENTE' | 'OK' | 'FALHA';

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const minutaId = String(id || '').trim();
    if (!minutaId) return json({ ok: false, error: 'minutaId ausente' }, 400);

    const checklist = await prisma.carregamentoChecklist.findUnique({
      where: { minutaId },
      include: {
        itens: {
          include: { volume: true },
        },
      },
    });

    if (!checklist) {
      // retorna vazio (UI trata como tudo pendente)
      return json({ ok: true, checklist: null, itens: [] as any[] });
    }

    const itens = (checklist.itens || []).map((it) => ({
      id: it.id,
      volumeId: it.volumeId,
      etiqueta: it.volume?.etiqueta ?? null,
      status: it.status as ItemStatus,
      note: it.note ?? null,
      checkedAt: it.checkedAt ? it.checkedAt.toISOString?.() ?? String(it.checkedAt) : null,
    }));

    return json({
      ok: true,
      checklist: {
        id: checklist.id,
        minutaId: checklist.minutaId,
        status: checklist.status,
        conferente: checklist.conferente ?? null,
        startedAt: checklist.startedAt ? checklist.startedAt.toISOString?.() ?? String(checklist.startedAt) : null,
        finishedAt: checklist.finishedAt ? checklist.finishedAt.toISOString?.() ?? String(checklist.finishedAt) : null,
        notes: checklist.notes ?? null,
      },
      itens,
    });
  } catch (e: any) {
    console.error('GET /api/minutas/[id]/checklist error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno' }, 500);
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const minutaId = String(id || '').trim();
    if (!minutaId) return json({ ok: false, error: 'minutaId ausente' }, 400);

    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action || '').trim(); // 'finalizar' | 'reabrir'

    if (action === 'finalizar') {
      const conferente = String(body?.conferente || '').trim() || null;

      // Garante que o checklist existe antes de finalizar
      let existing = await prisma.carregamentoChecklist.findUnique({
        where: { minutaId },
        select: { id: true, status: true },
      });
      if (!existing) {
        existing = await prisma.carregamentoChecklist.create({
          data: { minutaId },
          select: { id: true, status: true },
        });
      }

      const updated = await prisma.carregamentoChecklist.update({
        where: { minutaId },
        data: {
          status: 'FINALIZADO',
          finishedAt: new Date(),
          ...(conferente ? { conferente } : {}),
        },
        select: { id: true, minutaId: true, status: true, finishedAt: true, conferente: true },
      });

      return json({ ok: true, checklist: updated });
    }

    if (action === 'reabrir') {
      const updated = await prisma.carregamentoChecklist.update({
        where: { minutaId },
        data: { status: 'ABERTO', finishedAt: null },
        select: { id: true, minutaId: true, status: true, finishedAt: true, conferente: true },
      });
      return json({ ok: true, checklist: updated });
    }

    return json({ ok: false, error: 'Ação inválida. Use "finalizar" ou "reabrir".' }, 400);
  } catch (e: any) {
    console.error('PATCH /api/minutas/[id]/checklist error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno' }, 500);
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const minutaId = String(id || '').trim();
    if (!minutaId) return json({ ok: false, error: 'minutaId ausente' }, 400);

    const body = await req.json().catch(() => ({} as any));
    const conferente = String(body?.conferente || '').trim() || null;
    const notes = String(body?.notes || '').trim() || null;

    let up: { id: string; minutaId: string } | null = null;
    try {
      up = await prisma.carregamentoChecklist.upsert({
        where: { minutaId },
        update: { conferente, notes },
        create: { minutaId, conferente, notes },
        select: { id: true, minutaId: true },
      });
    } catch (upsertErr: any) {
      // Race condition: outro request criou entre o where e o create
      if (upsertErr?.code === 'P2002') {
        up = await prisma.carregamentoChecklist.update({
          where: { minutaId },
          data: { conferente, notes },
          select: { id: true, minutaId: true },
        });
      } else {
        throw upsertErr;
      }
    }
    if (!up) return json({ ok: false, error: 'Falha ao criar/atualizar checklist' }, 500);

    return json({ ok: true, checklistId: up.id, minutaId: up.minutaId }, 200);
  } catch (e: any) {
    console.error('POST /api/minutas/[id]/checklist error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno' }, 500);
  }
}