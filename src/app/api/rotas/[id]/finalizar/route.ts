// src/app/api/rotas/[id]/finalizar/route.ts
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

const RotaD = () => getDelegate(['rota', 'Rota']);
const ParadaD = () => getDelegate(['parada', 'Parada', 'rotaParada', 'RotaParada', 'paradaRota', 'ParadaRota']);
const ColetaD = () => getDelegate(['coleta', 'Coleta']);
const ScanEventD = () =>
  getDelegate(['scanEvent', 'ScanEvent', 'scan_event', 'eventoScan', 'EventoScan', 'scanEvento', 'ScanEvento']);

async function createEventOnce(args: { rotaId: string; etiqueta: string; status: string; note?: string | null }) {
  const { d: ev } = ScanEventD();
  if (!ev) return;

  const exists = await ev.findFirst({
    where: { rotaId: args.rotaId, etiqueta: args.etiqueta, status: args.status },
    select: { id: true },
  });
  if (exists) return;

  await ev.create({
    data: { rotaId: args.rotaId, etiqueta: args.etiqueta, status: args.status, note: args.note ?? null },
    select: { id: true },
  });
}

async function safeUpdateColetaEntregue(tx: any, coletaId: string, now: Date) {
  try {
    return await tx.coleta.update({
      where: { id: coletaId },
      data: { status: 'ENTREGUE', entregueAt: now },
      select: { id: true },
    });
  } catch {
    return await tx.coleta.update({
      where: { id: coletaId },
      data: { status: 'ENTREGUE' },
      select: { id: true },
    });
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const rotaId = String(id || '').trim();
    if (!rotaId) return json({ ok: false, error: 'rotaId ausente' }, 400);

    const body = (await req.json().catch(() => null)) as any;
    const force = body?.force === undefined ? true : Boolean(body.force);

    const { d: rotaDelegate } = RotaD();
    const { d: paradaDelegate } = ParadaD();
    const { d: coletaDelegate } = ColetaD();

    if (!rotaDelegate) return json({ ok: false, error: 'Delegate de Rota não encontrado no Prisma Client.' }, 500);
    if (!paradaDelegate) return json({ ok: false, error: 'Delegate de Parada não encontrado no Prisma Client.' }, 500);
    if (!coletaDelegate) return json({ ok: false, error: 'Delegate de Coleta não encontrado no Prisma Client.' }, 500);

    const rota = await rotaDelegate.findUnique({
      where: { id: rotaId },
      select: { id: true, status: true },
    });
    if (!rota) return json({ ok: false, error: 'Rota não encontrada' }, 404);

    const now = new Date();

    // carrega paradas
    const paradas = await paradaDelegate.findMany({
      where: { rotaId },
      select: { id: true, coletaId: true, statusExec: true, checkinAt: true, checkoutAt: true },
      orderBy: { ordem: 'asc' },
    });

    // finaliza em transação
    await prisma.$transaction(async (tx: any) => {
      // 1) rota -> CONCLUIDA
      await tx.rota.update({
        where: { id: rotaId },
        data: { status: 'CONCLUIDA' },
        select: { id: true },
      });

      // 2) paradas -> ENTREGUE com timestamps
      for (const p of paradas) {
        const needCheckin = !p.checkinAt;
        const needCheckout = !p.checkoutAt;
        const needStatus = p.statusExec !== 'ENTREGUE';

        if (force || needCheckin || needCheckout || needStatus) {
          await tx.parada.update({
            where: { id: p.id },
            data: {
              ...(needCheckin ? { checkinAt: now } : {}),
              ...(needCheckout ? { checkoutAt: now } : {}),
              ...(needStatus ? { statusExec: 'ENTREGUE' } : {}),
            },
            select: { id: true },
          });
        }

        // 3) coletas -> ENTREGUE
        if (p.coletaId) {
          await safeUpdateColetaEntregue(tx, p.coletaId, now);
        }
      }
    });

    await createEventOnce({
      rotaId,
      etiqueta: `ROTA:${rotaId}`,
      status: 'ROTA_FINALIZADA',
      note: 'Rota finalizada (CONCLUIDA) via endpoint /finalizar (forçando paradas/coletas).',
    });

    return json({ ok: true, rotaId, status: 'CONCLUIDA', paradas: paradas.length });
  } catch (e: any) {
    console.error('POST /api/rotas/[id]/finalizar error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno' }, 500);
  }
}