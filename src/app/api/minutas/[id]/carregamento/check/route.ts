import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = { params: Promise<{ id: string }> };

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function normEtq(raw: string) {
  let s = String(raw || '').trim().toUpperCase();
  if (s.startsWith('ETQ-')) s = s.slice(4);
  if (s.startsWith('ETQ:')) s = s.slice(4);
  return s.trim().toUpperCase();
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const minutaId = String(id || '').trim();
    if (!minutaId) return json({ ok: false, error: 'minutaId ausente.' }, 400);

    const body = await req.json().catch(() => null);
    if (!body) return json({ ok: false, error: 'JSON inválido.' }, 400);

    const etiquetaRaw = String(body?.etiqueta || '').trim();
    const etiqueta = normEtq(etiquetaRaw);
    if (!etiqueta) return json({ ok: false, error: 'etiqueta é obrigatória.' }, 400);

    const statusIn = String(body?.status || 'OK').trim().toUpperCase();
    const status = (['OK', 'FALTA', 'AVARIA', 'PENDENTE'].includes(statusIn) ? statusIn : 'OK') as any;
    const note = body?.note ? String(body.note).slice(0, 500) : null;

    // Get or create checklist
    let checklist = await prisma.carregamentoChecklist.findUnique({
      where: { minutaId },
      select: { id: true },
    });
    if (!checklist) {
      checklist = await prisma.carregamentoChecklist.create({
        data: { minutaId, status: 'ABERTO' },
        select: { id: true },
      });
    }

    // Find volume by etiqueta in this minuta
    const volume = await prisma.minutaVolume.findFirst({
      where: {
        etiqueta: { equals: etiqueta, mode: 'insensitive' },
        minutaItem: { minutaId },
      },
      select: { id: true, etiqueta: true, descricao: true },
    });

    if (!volume) {
      return json({ ok: false, error: `Etiqueta "${etiqueta}" não encontrada nesta minuta.` }, 404);
    }

    // Upsert checklist item
    const now = new Date();
    const updated = await prisma.carregamentoChecklistItem.upsert({
      where: {
        checklistId_volumeId: {
          checklistId: checklist.id,
          volumeId: volume.id,
        },
      },
      update: {
        status,
        checkedAt: now,
        note: note ?? undefined,
      },
      create: {
        checklistId: checklist.id,
        volumeId: volume.id,
        status,
        checkedAt: now,
        note: note ?? undefined,
      },
      select: { id: true, volumeId: true, status: true, checkedAt: true, note: true },
    });

    // Log scan event
    try {
      await prisma.scanEvent.create({
        data: {
          etiqueta: `ETQ:${etiqueta}`,
          status: 'CARREGAMENTO_CHECK',
          note: `minutaId=${minutaId} checklistId=${checklist.id} status=${status}`,
        },
      });
    } catch {}

    return json({
      ok: true,
      checklistId: checklist.id,
      item: { ...updated, etiqueta: volume.etiqueta, descricao: volume.descricao },
    });
  } catch (e: any) {
    console.error('POST /api/minutas/[id]/carregamento/check error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno.' }, 500);
  }
}
