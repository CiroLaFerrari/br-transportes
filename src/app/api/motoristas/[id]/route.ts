import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// PATCH /api/motoristas/[id]
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const data: any = {};

    if (body?.nome !== undefined) {
      const n = String(body.nome || '').trim();
      if (!n) return NextResponse.json({ error: 'Nome não pode ser vazio.' }, { status: 400 });
      data.nome = n;
    }
    if (body?.documento !== undefined) {
      data.documento = body.documento ? String(body.documento).trim() : null;
    }
    if (body?.disponibilidade !== undefined) {
      data.disponibilidade = Boolean(body.disponibilidade);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo informado.' }, { status: 400 });
    }

    const updated = await prisma.motorista.update({ where: { id }, data });
    return NextResponse.json({ ok: true, updated });
  } catch (e: any) {
    console.error('PATCH /api/motoristas/[id] error:', e);
    return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 });
  }
}

// DELETE /api/motoristas/[id]
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await prisma.motorista.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('DELETE /api/motoristas/[id] error:', e);
    return NextResponse.json({ error: 'Falha ao excluir motorista' }, { status: 500 });
  }
}
