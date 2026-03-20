import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/rotas/:id/stops/:stopId/status  body: { status, note? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string, stopsId: string }> }) {
  try {
    const { id, stopsId } = await params;
    const b = await req.json();
    const status = String(b.status ?? '').toUpperCase();
    const note = b.note ? String(b.note) : null;

    const ALLOWED = ['PENDENTE', 'EM_ATENDIMENTO', 'ENTREGUE', 'FALHA'];
    if (!ALLOWED.includes(status)) {
      return NextResponse.json({ error: `Status inválido. Use: ${ALLOWED.join(', ')}` }, { status: 400 });
    }

    const stop = await prisma.stopPlan.findUnique({ where: { id: stopsId } });
    if (!stop || stop.routePlanId !== id) {
      return NextResponse.json({ error: 'Parada não encontrada para esta rota' }, { status: 404 });
    }

    const data: any = { status, note: note ?? undefined };
    if (status === 'ENTREGUE' || status === 'FALHA') data.doneAt = new Date();

    const upd = await prisma.stopPlan.update({ where: { id: stop.id }, data });

    // (Opcional) Se todas ENTREGUE/FALHA -> concluir rota
    const all = await prisma.stopPlan.findMany({ where: { routePlanId: stop.routePlanId } });
    const allDone = all.every(s => s.status === 'ENTREGUE' || s.status === 'FALHA');
    if (allDone) {
      await prisma.routePlan.update({
        where: { id: stop.routePlanId },
        data: { status: 'CONCLUIDA', finishedAt: new Date() }
      });
    }

    return NextResponse.json(upd);
  } catch {
    return NextResponse.json({ error: 'Erro ao atualizar status da parada' }, { status: 500 });
  }
}
