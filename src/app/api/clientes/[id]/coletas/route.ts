import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

// GET /api/clientes/:id/coletas?limit=50&q=texto
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const cli = await prisma.cliente.findUnique({ where: { id }, select: { id: true } });
    if (!cli) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const limitParam = Number(searchParams.get('limit') ?? '20');
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 20;
    const q = (searchParams.get('q') ?? '').trim();

    const where: any = { clienteId: id };
    if (q) {
      where.OR = [
        { nf: { contains: q, mode: 'insensitive' } },
        { cidade: { contains: q, mode: 'insensitive' } },
        { uf: { contains: q, mode: 'insensitive' } },
      ];
    }

    const list = await prisma.coleta.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' as any },
      select: {
        id: true,
        nf: true,
        cidade: true,
        uf: true,
        valorFrete: true,
        pesoTotalKg: true,
        createdAt: true as any,
        updatedAt: true as any,
      },
    });

    return NextResponse.json(list);
  } catch (e: any) {
    console.error('GET /api/clientes/[id]/coletas error:', e);
    return NextResponse.json({ error: e?.message || 'Falha ao listar coletas do cliente' }, { status: 500 });
  }
}