import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limitNum = Number(searchParams.get('limit') || '50');
    const limit = Number.isFinite(limitNum) ? Math.max(1, Math.min(200, limitNum)) : 50;

    // Coletas que ainda NÃO têm nenhuma parada com rotaId preenchido
    const list = await prisma.coleta.findMany({
      where: {
        paradas: {
          none: {
            rotaId: { not: null },
          },
        },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        nf: true,
        cidade: true,
        uf: true,
        createdAt: true,
        Cliente: { select: { id: true, razao: true } },
      },
    });

    return NextResponse.json({ ok: true, list });
  } catch (e: any) {
    console.error('GET /api/coletas/sem-rota error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erro interno' }, { status: 500 });
  }
}
