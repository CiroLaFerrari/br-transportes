import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * POST /api/planejamentos/:id/vincular-paradas
 * Body:
 * {
 *   coletaIds?: string[]    // vincula TODAS as paradas dessas coletas
 *   paradaIds?: string[]    // alternativa: vincula paradas específicas
 *   resetOrdem?: boolean    // default true: renumera ordem 1..N no planejamento
 * }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const planejamentoId = String(id || '').trim();
    if (!planejamentoId) return json({ ok: false, error: 'planejamentoId inválido.' }, 400);

    const body = await req.json().catch(() => null);
    const coletaIds: string[] = Array.isArray(body?.coletaIds) ? body.coletaIds.map((x: any) => String(x).trim()).filter(Boolean) : [];
    const paradaIds: string[] = Array.isArray(body?.paradaIds) ? body.paradaIds.map((x: any) => String(x).trim()).filter(Boolean) : [];
    const resetOrdem = body?.resetOrdem !== false; // default true

    if (coletaIds.length === 0 && paradaIds.length === 0) {
      return json({ ok: false, error: 'Informe coletaIds[] ou paradaIds[].' }, 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const plano = await tx.planejamento.findUnique({
        where: { id: planejamentoId },
        select: { id: true, name: true },
      });
      if (!plano) throw new Error('Planejamento não encontrado.');

      // 1) resolve quais paradas serão vinculadas
      const paradas = await tx.parada.findMany({
        where: {
          ...(paradaIds.length ? { id: { in: paradaIds } } : {}),
          ...(coletaIds.length ? { coletaId: { in: coletaIds } } : {}),
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, coletaId: true, ordem: true, planejamentoId: true },
      });

      if (paradas.length === 0) throw new Error('Nenhuma parada encontrada para vincular.');

      // 2) vincula planejamentoId
      await tx.parada.updateMany({
        where: { id: { in: paradas.map((p) => p.id) } },
        data: { planejamentoId },
      });

      // 3) se resetOrdem, renumera 1..N dentro do planejamento
      let updatedList: any[] = [];
      if (resetOrdem) {
        const doPlano = await tx.parada.findMany({
          where: { planejamentoId },
          orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, ordem: true, coletaId: true },
        });

        // renumera
        let k = 1;
        for (const p of doPlano) {
          await tx.parada.update({
            where: { id: p.id },
            data: { ordem: k },
            select: { id: true },
          });
          k++;
        }

        updatedList = await tx.parada.findMany({
          where: { planejamentoId },
          orderBy: { ordem: 'asc' },
          select: { id: true, ordem: true, coletaId: true, planejamentoId: true },
        });
      } else {
        updatedList = await tx.parada.findMany({
          where: { id: { in: paradas.map((p) => p.id) } },
          orderBy: { createdAt: 'asc' },
          select: { id: true, ordem: true, coletaId: true, planejamentoId: true },
        });
      }

      return {
        planejamento: plano,
        vinculadas: paradas.length,
        paradas: updatedList,
      };
    });

    return json({ ok: true, ...result }, 200);
  } catch (e: any) {
    console.error('POST /api/planejamentos/[id]/vincular-paradas error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno' }, 500);
  }
}
