import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/planejamentos/:id/paradas
 * Retorna as paradas vinculadas ao planejamento, em ordem.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id: planejamentoId } = await ctx.params;

    const list = await prisma.parada.findMany({
      where: { planejamentoId },
      orderBy: { ordem: 'asc' },
      select: {
        id: true,
        ordem: true,
        label: true,
        lon: true,
        lat: true,
        kmTrecho: true,
        durMinTrecho: true,
        coletaId: true,
        createdAt: true,
        Coleta: {
          select: {
            id: true,
            nf: true,
            cidade: true,
            uf: true,
            valorFrete: true,
            pesoTotalKg: true,
            Cliente: { select: { id: true, razao: true, percentualFrete: true } },
          },
        },
      },
    });

    return NextResponse.json({ value: list });
  } catch (e: any) {
    console.error('GET /planejamentos/:id/paradas error:', e);
    return NextResponse.json(
      { error: 'Falha ao listar paradas.' },
      { status: 500 }
    );
  }
}
