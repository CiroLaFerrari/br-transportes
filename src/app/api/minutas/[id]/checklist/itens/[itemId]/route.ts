import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  params: Promise<{ id: string; itemId: string }>; // Next 15
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

type ItemStatus = 'PENDENTE' | 'OK' | 'FALHA';

function normStatus(v: any): ItemStatus {
  const s = String(v || '').toUpperCase();
  if (s === 'OK' || s === 'FALHA' || s === 'PENDENTE') return s as ItemStatus;
  return 'OK';
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { id, itemId } = await ctx.params;
    const minutaId = String(id || '').trim();
    const volumeId = String(itemId || '').trim();

    if (!minutaId) return json({ ok: false, error: 'minutaId ausente' }, 400);
    if (!volumeId) return json({ ok: false, error: 'volumeId ausente' }, 400);

    const body = await req.json().catch(() => ({} as any));
    const status = normStatus(body?.status);
    const note = String(body?.note || '').trim() || null;

    // garante checklist (com fallback para race condition)
    let checklist: { id: string } | null = null;
    try {
      checklist = await prisma.carregamentoChecklist.upsert({
        where: { minutaId },
        update: {},
        create: { minutaId },
        select: { id: true },
      });
    } catch (upsertErr: any) {
      // Race condition: outro request criou entre o where e o create
      if (upsertErr?.code === 'P2002') {
        checklist = await prisma.carregamentoChecklist.findUnique({
          where: { minutaId },
          select: { id: true },
        });
      } else {
        throw upsertErr;
      }
    }
    if (!checklist) return json({ ok: false, error: 'Falha ao garantir checklist' }, 500);

    // garante que o volume existe
    const vol = await prisma.minutaVolume.findUnique({
      where: { id: volumeId },
      select: { id: true, minutaItemId: true },
    });
    if (!vol) return json({ ok: false, error: 'Volume não encontrado' }, 404);

    // (opcional) valida que o volume pertence a uma minuta deste id
    const item = await prisma.minutaItem.findUnique({
      where: { id: vol.minutaItemId },
      select: { minutaId: true },
    });
    if (!item || item.minutaId !== minutaId) {
      return json({ ok: false, error: 'Volume não pertence a esta minuta' }, 400);
    }

    const checkedAt = status === 'PENDENTE' ? null : new Date();

    await prisma.carregamentoChecklistItem.upsert({
      where: { checklistId_volumeId: { checklistId: checklist.id, volumeId } },
      update: { status, note, checkedAt },
      create: { checklistId: checklist.id, volumeId, status, note, checkedAt },
      select: { id: true },
    });

    return json({ ok: true }, 200);
  } catch (e: any) {
    console.error('POST /api/minutas/[id]/checklist/itens/[itemId] error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno' }, 500);
  }
}