// src/app/api/coletas/[id]/acao/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = { params: Promise<{ id: string }> };

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function getDelegate(candidates: string[]) {
  const db: any = prisma as any;
  for (const key of candidates) {
    const d = db?.[key];
    if (d && typeof d.findUnique === 'function') return { d, key };
  }
  return { d: null as any, key: null as any };
}

const ColetaD = () => getDelegate(['coleta', 'Coleta']);
const ScanEventD = () =>
  getDelegate(['scanEvent', 'ScanEvent', 'scan_event', 'eventoScan', 'EventoScan', 'scanEvento', 'ScanEvento']);

// cria evento UMA VEZ (idempotente por rotaId+etiqueta+status)
async function createEventOnce(args: { etiqueta: string; status: string; note?: string | null }) {
  const { d: ev } = ScanEventD();
  if (!ev) return;

  const exists = await ev.findFirst({
    where: { etiqueta: args.etiqueta, status: args.status },
    select: { id: true },
  });
  if (exists) return;

  await ev.create({
    data: { etiqueta: args.etiqueta, status: args.status, note: args.note ?? null },
    select: { id: true },
  });
}

// tenta atualizar ENTREGUE com entregueAt (se o campo existir); se não existir, cai pro básico
async function safeUpdateEntregue(tx: any, coletaId: string, now: Date) {
  try {
    return await tx.coleta.update({
      where: { id: coletaId },
      data: { status: 'ENTREGUE', entregueAt: now },
      select: { id: true, status: true },
    });
  } catch {
    return await tx.coleta.update({
      where: { id: coletaId },
      data: { status: 'ENTREGUE' },
      select: { id: true, status: true },
    });
  }
}

// leitura segura (sem depender de entregueAt existir no schema)
async function safeFindColeta(coletaDelegate: any, coletaId: string) {
  // select mínimo garantido (campos que você já usa no sistema)
  const baseSelect = {
    id: true,
    nf: true,
    status: true,
    entradaPatioAt: true,
    fimPatioAt: true,
    embarqueAt: true,
    createdAt: true,
    updatedAt: true,
    clienteId: true,
    cidade: true,
    uf: true,
    valorFrete: true,
    pesoTotalKg: true,
  };

  // primeiro tenta com baseSelect
  const c1 = await coletaDelegate.findUnique({
    where: { id: coletaId },
    select: baseSelect,
  });
  return c1;
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const coletaId = String(id || '').trim();
    if (!coletaId) return json({ ok: false, error: 'coletaId ausente' }, 400);

    const body = (await req.json().catch(() => null)) as any;
    const action = String(body?.action || '').trim().toUpperCase();
    const note = body?.note ? String(body.note) : null;

    const { d: coletaDelegate } = ColetaD();
    if (!coletaDelegate) return json({ ok: false, error: 'Delegate de Coleta não encontrado no Prisma Client.' }, 500);

    const coleta = await safeFindColeta(coletaDelegate, coletaId);
    if (!coleta) return json({ ok: false, error: 'Coleta não encontrada' }, 404);

    const now = new Date();

    if (action === 'SAIDA_PATIO') {
      // ✅ idempotência forte: se já tem fimPatioAt, NÃO altera e NÃO cria novo evento
      if (coleta.fimPatioAt) {
        return json({
          ok: true,
          action,
          coletaId,
          noop: true,
          status: coleta.status,
          message: 'Saída do pátio já estava declarada (noop).',
        });
      }

      const updated = await prisma.$transaction(async (tx: any) => {
        // regra: saída do pátio => fimPatioAt + embarqueAt + status EM_TRANSITO
        const u = await tx.coleta.update({
          where: { id: coletaId },
          data: {
            fimPatioAt: now,
            embarqueAt: now,
            status: 'EM_TRANSITO',
          },
          select: { id: true, status: true, fimPatioAt: true, embarqueAt: true },
        });
        return u;
      });

      await createEventOnce({
        etiqueta: `COLETA:${coletaId}`,
        status: 'PATIO_EXIT_DECL',
        note: note ?? 'Saída do pátio declarada',
      });

      return json({ ok: true, action, coletaId, updated });
    }

    if (action === 'EM_CARGA') {
      const updated = await prisma.$transaction(async (tx: any) => {
        return await tx.coleta.update({
          where: { id: coletaId },
          data: { status: 'EM_CARGA' },
          select: { id: true, status: true },
        });
      });

      await createEventOnce({
        etiqueta: `COLETA:${coletaId}`,
        status: 'EM_CARGA_DECL',
        note: note ?? 'Coleta marcada como em carga',
      });

      return json({ ok: true, action, coletaId, updated });
    }

    if (action === 'EM_TRANSITO') {
      const updated = await prisma.$transaction(async (tx: any) => {
        const data: any = { status: 'EM_TRANSITO' };
        // set embarqueAt and fimPatioAt if not already set
        if (!coleta.embarqueAt) data.embarqueAt = now;
        if (!coleta.fimPatioAt) data.fimPatioAt = now;
        return await tx.coleta.update({
          where: { id: coletaId },
          data,
          select: { id: true, status: true, embarqueAt: true, fimPatioAt: true },
        });
      });

      await createEventOnce({
        etiqueta: `COLETA:${coletaId}`,
        status: 'EM_TRANSITO_DECL',
        note: note ?? 'Coleta marcada como em trânsito',
      });

      return json({ ok: true, action, coletaId, updated });
    }

    if (action === 'ENTREGUE') {
      const updated = await prisma.$transaction(async (tx: any) => {
        return await safeUpdateEntregue(tx, coletaId, now);
      });

      await createEventOnce({
        etiqueta: `COLETA:${coletaId}`,
        status: 'DELIVERED_DECL',
        note: note ?? 'Entrega declarada',
      });

      return json({ ok: true, action, coletaId, updated });
    }

    return json({ ok: false, error: `Ação inválida: ${action}` }, 400);
  } catch (e: any) {
    console.error('POST /api/coletas/[id]/acao error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno' }, 500);
  }
}