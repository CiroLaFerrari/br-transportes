import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const limitNum = Number(searchParams.get('limit') || '20');
    const limit = Number.isFinite(limitNum) ? Math.max(1, Math.min(100, limitNum)) : 20;

    const pageNum = Number(searchParams.get('page') || '1');
    const page = Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1;

    const skip = (page - 1) * limit;

    const [total, list] = await Promise.all([
      prisma.rota.count(),
      prisma.rota.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          dataRota: true,
          status: true,
          kmTotal: true,
          freteTotal: true,
          motoristaId: true,
          veiculoId: true,
          createdAt: true,
          updatedAt: true,
          paradas: {
            select: {
              id: true,
              statusExec: true,
            },
          },
        },
      }),
    ]);

    const data = list.map((r) => {
      const totalParadas = r.paradas.length;
      const entregues = r.paradas.filter((p) => p.statusExec === 'ENTREGUE').length;

      return {
        id: r.id,
        dataRota: r.dataRota,
        status: r.status,
        kmTotal: r.kmTotal,
        freteTotal: r.freteTotal,
        motoristaId: r.motoristaId,
        veiculoId: r.veiculoId,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        totalParadas,
        entregues,
      };
    });

    return NextResponse.json({
      ok: true,
      data,
      page,
      limit,
      total,
      hasMore: skip + data.length < total,
    });
  } catch (e: any) {
    console.error('GET /api/rotas error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erro interno' }, { status: 500 });
  }
}