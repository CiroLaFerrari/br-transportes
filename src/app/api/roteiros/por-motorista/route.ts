import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type ApiResp = {
  ok: boolean;
  planos?: any[];
  error?: string;
};

/**
 * GET /api/roteiros/por-motorista?motorista=Joao&data=2025-11-28
 *
 * - Filtra Planejamento por:
 *   - opcionalmente nome do motorista (driverName OU Motorista.nome)
 *   - opcionalmente data (faixa no createdAt do dia informado)
 * - Retorna também as Paradas, incluindo statusExec / checkinAt / checkoutAt / obsStatus.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const motorista = (searchParams.get('motorista') || '').trim();
    const data = (searchParams.get('data') || '').trim();

    const where: any = {};
    const AND: any[] = [];

    if (motorista) {
      AND.push({
        OR: [
          {
            driverName: {
              contains: motorista,
              mode: 'insensitive',
            },
          },
          {
            Motorista: {
              nome: {
                contains: motorista,
                mode: 'insensitive',
              },
            },
          },
        ],
      });
    }

    if (data) {
      const start = new Date(`${data}T00:00:00.000Z`);
      const end = new Date(`${data}T23:59:59.999Z`);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        AND.push({
          createdAt: {
            gte: start,
            lte: end,
          },
        });
      }
    }

    if (AND.length > 0) {
      where.AND = AND;
    }

    const planos = await prisma.planejamento.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        status: true,
        driverName: true,
        vehiclePlate: true,
        createdAt: true,
        paradas: {
          orderBy: { ordem: 'asc' },
          select: {
            id: true,
            ordem: true,
            label: true,
            kmTrecho: true,
            durMinTrecho: true,

            // 🔹 campos novos de execução (Trilha 2)
            statusExec: true,
            checkinAt: true,
            checkoutAt: true,
            obsStatus: true,

            Coleta: {
              select: {
                id: true,
                nf: true,
                cidade: true,
                uf: true,
                valorFrete: true,
                pesoTotalKg: true,
              },
            },
          },
        },
      },
    });

    const resp: ApiResp = {
      ok: true,
      planos,
    };

    return NextResponse.json(resp);
  } catch (e: any) {
    console.error('GET /api/roteiros/por-motorista error:', e);
    const resp: ApiResp = {
      ok: false,
      error: e?.message || 'Erro interno ao carregar roteiros',
    };
    return NextResponse.json(resp, { status: 500 });
  }
}
