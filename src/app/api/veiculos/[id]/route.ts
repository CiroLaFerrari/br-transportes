import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/veiculos/[id]
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const veiculo = await prisma.veiculo.findUnique({ where: { id } });
    if (!veiculo) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });
    return NextResponse.json(veiculo);
  } catch (e: any) {
    console.error('GET /api/veiculos/[id] error:', e);
    return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 });
  }
}

// PATCH /api/veiculos/[id]
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const data: any = {};

    if (body?.placa !== undefined) {
      const p = String(body.placa || '').trim().toUpperCase();
      if (!p) return NextResponse.json({ error: 'Placa não pode ser vazia.' }, { status: 400 });
      data.placa = p;
    }
    if (body?.capacidadeKg !== undefined) data.capacidadeKg = Number(body.capacidadeKg);
    if (body?.capacidadeM3 !== undefined) data.capacidadeM3 = Number(body.capacidadeM3);
    if (body?.compCm !== undefined) data.compCm = Number(body.compCm);
    if (body?.largCm !== undefined) data.largCm = Number(body.largCm);
    if (body?.altCm !== undefined) data.altCm = Number(body.altCm);

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo informado.' }, { status: 400 });
    }

    const updated = await prisma.veiculo.update({ where: { id }, data });
    return NextResponse.json({ ok: true, updated });
  } catch (e: any) {
    console.error('PATCH /api/veiculos/[id] error:', e);
    if (e?.code === 'P2002') return NextResponse.json({ error: 'Placa já cadastrada.' }, { status: 409 });
    return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 });
  }
}

// DELETE /api/veiculos/[id]
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const veiculoId = String(id || '').trim();
    if (!veiculoId) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

    await prisma.veiculo.delete({ where: { id: veiculoId } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('DELETE /api/veiculos/[id] error:', e);
    return NextResponse.json({ error: e?.message || 'Falha ao excluir veículo' }, { status: 500 });
  }
}