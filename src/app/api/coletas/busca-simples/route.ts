import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/coletas/busca-simples?q=&limit=
 *
 * Usado pela tela de Planejamento para buscar coletas
 * por NF / cidade / UF / razão social do cliente.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const q = (searchParams.get('q') || '').trim();

    const limitNum = Number(searchParams.get('limit') || '20');
    const limit = Number.isFinite(limitNum)
      ? Math.max(1, Math.min(200, limitNum))
      : 20;

    const where = q
      ? {
          OR: [
            { nf: { contains: q, mode: 'insensitive' as const } },
            { cidade: { contains: q, mode: 'insensitive' as const } },
            { uf: { contains: q, mode: 'insensitive' as const } },
            {
              Cliente: {
                razao: { contains: q, mode: 'insensitive' as const },
              },
            },
          ],
        }
      : {};

    const list = await prisma.coleta.findMany({
      where,
      take: limit,
      orderBy: { id: 'desc' },
      select: {
        id: true,
        nf: true,
        cidade: true,
        uf: true,
        valorFrete: true,
        pesoTotalKg: true,
        clienteId: true,
        Cliente: {
          select: {
            id: true,
            razao: true,
          },
        },
      },
    });

    // retorno simples pra lista "Buscar coletas para vincular"
    return NextResponse.json(list);
  } catch (e: any) {
    console.error('GET /api/coletas/busca-simples error:', e);
    return NextResponse.json(
      { error: e?.message || 'Erro ao buscar coletas.' },
      { status: 500 },
    );
  }
}
