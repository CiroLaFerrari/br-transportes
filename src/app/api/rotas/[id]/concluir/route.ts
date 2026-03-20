import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/rotas/:id/concluir
// body opcional: { force?: boolean }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const rotaId = String(id || '').trim();
    if (!rotaId) return NextResponse.json({ ok: false, error: 'rotaId inválido' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const force = Boolean(body?.force);

    const rota = await prisma.rota.findUnique({
      where: { id: rotaId },
      select: {
        id: true,
        status: true,
        paradas: {
          select: { id: true, statusExec: true, coletaId: true, checkoutAt: true },
        },
      },
    });

    if (!rota) return NextResponse.json({ ok: false, error: 'Rota não encontrada' }, { status: 404 });

    const total = rota.paradas.length;
    const entregues = rota.paradas.filter((p) => p.statusExec === 'ENTREGUE').length;
    const pendentes = rota.paradas.filter((p) => p.statusExec === 'PENDENTE').length;
    const emAt = rota.paradas.filter((p) => p.statusExec === 'EM_ATENDIMENTO').length;
    const falhas = rota.paradas.filter((p) => p.statusExec === 'FALHA').length;

    if (!force) {
      const notDone = rota.paradas.filter((p) => p.statusExec !== 'ENTREGUE');
      if (notDone.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'Não é possível concluir a rota: ainda existem paradas não ENTREGUE. Use force=true se quiser forçar.',
            summary: { total, entregues, pendentes, emAt, falhas },
          },
          { status: 409 },
        );
      }
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // 1) Atualiza status da rota
      const updatedRota = await tx.rota.update({
        where: { id: rotaId },
        data: { status: 'CONCLUIDA' as any },
        select: { id: true, status: true },
      });

      // 2) Finaliza checkoutAt das paradas ENTREGUE que ainda não tem checkout
      await tx.parada.updateMany({
        where: {
          rotaId,
          statusExec: 'ENTREGUE' as any,
          checkoutAt: null,
        },
        data: { checkoutAt: now },
      });

      // 3) Se forçado: marca o que não foi entregue como FALHA e fecha checkoutAt
      if (force) {
        await tx.parada.updateMany({
          where: {
            rotaId,
            statusExec: { in: ['PENDENTE', 'EM_ATENDIMENTO'] as any },
          },
          data: {
            statusExec: 'FALHA' as any,
            checkoutAt: now,
            obsStatus: 'Finalizada por força (conclusão manual da rota)',
          } as any,
        });
      }

      // 4) Atualiza status das coletas ENTREGUE (sem depender de campo entregueAt)
      const coletaIdsEntregues = rota.paradas
        .filter((p) => p.statusExec === 'ENTREGUE')
        .map((p) => p.coletaId)
        .filter(Boolean);

      if (coletaIdsEntregues.length > 0) {
        await tx.coleta.updateMany({
          where: { id: { in: coletaIdsEntregues } },
          data: { status: 'ENTREGUE' as any },
        });
      }

      return { updatedRota };
    });

    return NextResponse.json({
      ok: true,
      rota: result.updatedRota,
      summary: { total, entregues, pendentes, emAt, falhas },
      forced: force,
    });
  } catch (e: any) {
    console.error('POST /api/rotas/[id]/concluir error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erro interno' }, { status: 500 });
  }
}