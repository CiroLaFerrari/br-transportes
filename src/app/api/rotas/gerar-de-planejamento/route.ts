import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * POST /api/rotas/gerar-de-planejamento
 * Body:
 * {
 *   planejamentoId: string;
 *   dataRota?: string | Date (ISO)
 *   motoristaId?: string
 *   veiculoId?: string
 *   resetStatusParadas?: boolean (default true)  -> coloca PENDENTE e limpa checkin/checkout
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    const planejamentoId = String(body?.planejamentoId || '').trim();
    if (!planejamentoId) {
      return json({ ok: false, error: 'planejamentoId é obrigatório.' }, 400);
    }

    const motoristaId = body?.motoristaId ? String(body.motoristaId).trim() : null;
    const veiculoId = body?.veiculoId ? String(body.veiculoId).trim() : null;

    const resetStatusParadas = body?.resetStatusParadas !== false; // default true

    const dataRota = body?.dataRota
      ? new Date(String(body.dataRota))
      : new Date();

    if (Number.isNaN(dataRota.getTime())) {
      return json({ ok: false, error: 'dataRota inválida (use ISO: 2026-01-22T10:00:00Z).' }, 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1) confere planejamento existe
      const plano = await tx.planejamento.findUnique({
        where: { id: planejamentoId },
        select: { id: true, name: true },
      });
      if (!plano) throw new Error('Planejamento não encontrado.');

      // 2) pega paradas do planejamento
      const paradas = await tx.parada.findMany({
        where: { planejamentoId },
        orderBy: { ordem: 'asc' },
        select: { id: true, ordem: true, coletaId: true, rotaId: true },
      });

      if (paradas.length === 0) {
        throw new Error('Este planejamento não tem paradas para virar rota.');
      }

      // 3) cria rota
      const rota = await tx.rota.create({
        data: {
          dataRota,
          motoristaId,
          veiculoId,
          status: 'PLANEJADA',
        },
        select: { id: true, dataRota: true, status: true },
      });

      // 4) vincula paradas à rota
      // por segurança: só vincula as paradas desse planejamento
      await tx.parada.updateMany({
        where: { id: { in: paradas.map((p) => p.id) } },
        data: {
          rotaId: rota.id,
          ...(resetStatusParadas
            ? {
                statusExec: 'PENDENTE',
                checkinAt: null,
                checkoutAt: null,
                obsStatus: null,
              }
            : {}),
        },
      });

      const paradasAtualizadas = await tx.parada.findMany({
        where: { rotaId: rota.id },
        orderBy: { ordem: 'asc' },
        select: {
          id: true,
          ordem: true,
          coletaId: true,
          statusExec: true,
          checkinAt: true,
          checkoutAt: true,
          planejamentoId: true,
          rotaId: true,
        },
      });

      return {
        rota,
        planejamento: plano,
        totalParadas: paradasAtualizadas.length,
        paradas: paradasAtualizadas,
      };
    });

    return json({ ok: true, ...result }, 201);
  } catch (e: any) {
    console.error('POST /api/rotas/gerar-de-planejamento error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno' }, 500);
  }
}
