import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/planejamentos/:id
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const plan = await prisma.planejamento.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        payload: true,
        vehiclePlate: true,
        driverName: true,
        notes: true,
        motoristaId: true,
        veiculoId: true,
        planStartAt: true,
        planEndAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!plan) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    return NextResponse.json(plan);
  } catch (e: any) {
    console.error('GET /api/planejamentos/[id] error:', e);
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 });
  }
}

// PATCH /api/planejamentos/:id  (atualiza metadados simples)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();

    const data: any = {};
    if (typeof body?.name === 'string') data.name = body.name;
    if (typeof body?.status === 'string') data.status = body.status;
    if (typeof body?.vehiclePlate === 'string' || body?.vehiclePlate === null) data.vehiclePlate = body.vehiclePlate;
    if (typeof body?.driverName === 'string' || body?.driverName === null) data.driverName = body.driverName;
    if (typeof body?.notes === 'string' || body?.notes === null) data.notes = body.notes;
    if (typeof body?.veiculoId === 'string' || body?.veiculoId === null) data.veiculoId = body.veiculoId;
    if (typeof body?.motoristaId === 'string' || body?.motoristaId === null) data.motoristaId = body.motoristaId;
    if (body?.payload !== undefined && typeof body.payload === 'object') data.payload = body.payload;

    const updated = await prisma.planejamento.update({
      where: { id },
      data,
      select: { id: true, name: true, status: true, vehiclePlate: true, driverName: true, notes: true, updatedAt: true },
    });

    return NextResponse.json(updated);
  } catch (e: any) {
    console.error('PATCH /api/planejamentos/[id] error:', e);
    // not found vira 404
    if (e?.code === 'P2025') return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 });
  }
}

// DELETE /api/planejamentos/:id
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    await prisma.planejamento.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('DELETE /api/planejamentos/[id] error:', e);
    if (e?.code === 'P2025') return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 });
  }
}
