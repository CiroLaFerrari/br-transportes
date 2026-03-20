import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

// Regras simples de transição:
const ALLOW: Record<string, string[]> = {
  PLANEJADA: ['ATRIBUIDA', 'CANCELADA'],
  ATRIBUIDA: ['EM_ROTA', 'CANCELADA'],
  EM_ROTA: ['CONCLUIDA', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = await req.json();
    const next = String(b.status ?? '').toUpperCase();
    if (!next) return NextResponse.json({ error: 'Informe status' }, { status: 400 });

    const rota = await prisma.routePlan.findUnique({ where: { id } });
    if (!rota) return NextResponse.json({ error: 'Rota não encontrada' }, { status: 404 });

    const allow = ALLOW[rota.status] ?? [];
    if (!allow.includes(next)) {
      return NextResponse.json({ error: `Transição inválida: ${rota.status} -> ${next}` }, { status: 400 });
    }

    const data: any = { status: next };
    if (next === 'EM_ROTA' && !rota.startedAt) data.startedAt = new Date();
    if (next === 'CONCLUIDA' && !rota.finishedAt) data.finishedAt = new Date();

    const updated = await prisma.routePlan.update({
      where: { id: rota.id },
      data,
      include: { stops: { orderBy: { order: 'asc' } } }
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Erro ao atualizar status da rota' }, { status: 500 });
  }
}
