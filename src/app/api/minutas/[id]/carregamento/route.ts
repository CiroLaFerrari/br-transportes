import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

async function ensureChecklist(minutaId: string) {
  const existing = await prisma.carregamentoChecklist.findUnique({
    where: { minutaId },
  });
  if (existing) return existing;

  return prisma.carregamentoChecklist.create({
    data: { minutaId, status: 'ABERTO' },
  });
}

async function seedItensIfNeeded(checklistId: string, minutaId: string) {
  const minuta = await prisma.minutaConferencia.findUnique({
    where: { id: minutaId },
    include: { itens: { include: { volumes: true } } },
  });
  if (!minuta) throw new Error('Minuta não encontrada.');

  const volumeIds: string[] = [];
  for (const it of minuta.itens || []) {
    for (const v of it.volumes || []) {
      volumeIds.push(v.id);
    }
  }
  if (volumeIds.length === 0) return { minuta, created: 0 };

  const existing = await prisma.carregamentoChecklistItem.findMany({
    where: { checklistId },
    select: { volumeId: true },
  });
  const existingSet = new Set(existing.map((x) => x.volumeId));

  const toCreate = volumeIds
    .filter((vid) => !existingSet.has(vid))
    .map((vid) => ({ checklistId, volumeId: vid, status: 'PENDENTE' as const }));

  if (toCreate.length > 0) {
    await prisma.carregamentoChecklistItem.createMany({ data: toCreate });
  }

  return { minuta, created: toCreate.length };
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const minutaId = String(id || '').trim();
    if (!minutaId) return json({ ok: false, error: 'minutaId ausente.' }, 400);

    const checklist = await ensureChecklist(minutaId);
    await seedItensIfNeeded(checklist.id, minutaId);

    const full = await prisma.carregamentoChecklist.findUnique({
      where: { id: checklist.id },
      include: {
        itens: {
          orderBy: { updatedAt: 'desc' },
          include: { volume: true },
        },
        minuta: true,
      },
    });

    if (!full) return json({ ok: false, error: 'Checklist não encontrado.' }, 404);

    return json({
      ok: true,
      conferencia: {
        id: full.id,
        minutaId: full.minutaId,
        status: full.status,
        conferente: full.conferente ?? null,
        startedAt: full.startedAt,
        finishedAt: full.finishedAt ?? null,
        notes: full.notes ?? null,
        createdAt: full.createdAt,
        updatedAt: full.updatedAt,
      },
      minuta: full.minuta
        ? {
            id: full.minuta.id,
            nfNumero: full.minuta.nfNumero,
            cliente: full.minuta.cliente,
            cidade: full.minuta.cidade,
            uf: full.minuta.uf,
            numero: full.minuta.numero ?? null,
          }
        : null,
      itens: full.itens.map((it) => ({
        id: it.id,
        volumeId: it.volumeId,
        etiqueta: it.volume?.etiqueta ?? '',
        descricao: it.volume?.descricao ?? '',
        codigo: it.volume?.codigo ?? '',
        tipo: it.volume?.tipo ?? '',
        status: it.status,
        checkedAt: it.checkedAt ?? null,
        note: it.note ?? null,
        updatedAt: it.updatedAt,
      })),
    });
  } catch (e: any) {
    console.error('GET /api/minutas/[id]/carregamento error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno.' }, 500);
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const minutaId = String(id || '').trim();
    if (!minutaId) return json({ ok: false, error: 'minutaId ausente.' }, 400);

    const body = await req.json().catch(() => null);
    if (!body) return json({ ok: false, error: 'JSON inválido.' }, 400);

    const checklist = await ensureChecklist(minutaId);
    const data: any = {};

    if (body.status !== undefined) {
      const s = String(body.status || '').trim().toUpperCase();
      if (!['ABERTO', 'FINALIZADO'].includes(s)) {
        return json({ ok: false, error: 'status inválido. Use ABERTO ou FINALIZADO.' }, 400);
      }
      data.status = s;
      if (s === 'FINALIZADO' && !checklist.finishedAt) data.finishedAt = new Date();
      if (s === 'ABERTO') data.finishedAt = null;
    }

    if (body.conferente !== undefined) data.conferente = body.conferente ? String(body.conferente).slice(0, 120) : null;
    if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).slice(0, 500) : null;

    const updated = await prisma.carregamentoChecklist.update({
      where: { id: checklist.id },
      data,
      select: { id: true, status: true, conferente: true, notes: true, finishedAt: true, updatedAt: true },
    });

    return json({ ok: true, updated });
  } catch (e: any) {
    console.error('PATCH /api/minutas/[id]/carregamento error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno.' }, 500);
  }
}
