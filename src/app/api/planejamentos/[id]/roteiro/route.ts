import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

type PlanoStatus = 'DRAFT' | 'PLANNED' | 'IN_TRANSIT' | 'DONE' | 'CANCELED';

function jserr(e: any) {
  return {
    name: e?.name,
    message: e?.message,
    code: e?.code,
    meta: e?.meta,
  };
}

/**
 * GET /api/planejamentos/:id/roteiro
 *
 * Retorna um "pacote" pronto para o app do motorista:
 * - dados básicos do planejamento
 * - paradas em ordem, com coleta vinculada (se houver)
 * - totais de km / minutos (somando os trechos das paradas)
 * - alguns dados do payload (origem/destinos), se existirem
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;

    const plan = await prisma.planejamento.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        driverName: true,
        vehiclePlate: true,
        createdAt: true,
        payload: true,
        paradas: {
          orderBy: { ordem: 'asc' },
          select: {
            id: true,
            ordem: true,
            label: true,
            lon: true,
            lat: true,
            kmTrecho: true,
            durMinTrecho: true,
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

    if (!plan) {
      return NextResponse.json(
        { ok: false, error: 'Planejamento não encontrado.' },
        { status: 404 },
      );
    }

    // Tenta extrair algumas infos do payload original (opcional)
    let originLabel: string | null = null;
    let destinosLabels: string[] = [];

    try {
      const payload: any = plan.payload || {};
      if (Array.isArray(payload.points) && payload.points.length > 0) {
        const [origem, ...dests] = payload.points;
        originLabel =
          typeof origem?.label === 'string'
            ? origem.label
            : null;
        destinosLabels = dests
          .map((p: any) => p?.label)
          .filter((s: any) => typeof s === 'string') as string[];
      }
    } catch {
      // se der erro ao ler payload, só ignora
    }

    // Totais a partir das paradas (somatório dos trechos)
    const totalKm = plan.paradas.reduce(
      (sum, p) => sum + (p.kmTrecho ?? 0),
      0,
    );
    const totalDurMin = plan.paradas.reduce(
      (sum, p) => sum + (p.durMinTrecho ?? 0),
      0,
    );

    const responseBody = {
      ok: true,
      planejamento: {
        id: plan.id,
        name: plan.name,
        status: plan.status as PlanoStatus,
        driverName: plan.driverName,
        vehiclePlate: plan.vehiclePlate,
        createdAt: plan.createdAt.toISOString(),
        originLabel,
        destinosLabels,
      },
      paradas: plan.paradas.map((p) => ({
        id: p.id,
        ordem: p.ordem,
        label: p.label,
        lon: p.lon,
        lat: p.lat,
        kmTrecho: p.kmTrecho,
        durMinTrecho: p.durMinTrecho,
        Coleta: p.Coleta
          ? {
              id: p.Coleta.id,
              nf: p.Coleta.nf,
              cidade: p.Coleta.cidade,
              uf: p.Coleta.uf,
              valorFrete: p.Coleta.valorFrete,
              pesoTotalKg: p.Coleta.pesoTotalKg,
            }
          : null,
      })),
      totais: {
        distance_km: totalKm,
        duration_min: totalDurMin,
      },
    };

    return NextResponse.json(responseBody);
  } catch (e: any) {
    console.error('GET /api/planejamentos/[id]/roteiro error:', e);
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || 'Erro interno ao carregar roteiro',
        detail: jserr(e),
      },
      { status: 500 },
    );
  }
}
