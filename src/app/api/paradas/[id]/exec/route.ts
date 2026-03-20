import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ParadaExecStatus, PlanStatus } from '@prisma/client';

type RouteContext = {
  // 👇 No Next novo, params é uma Promise
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, context: RouteContext) {
  try {
    // 👇 aqui a correção principal
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'Parâmetro id obrigatório.' },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => null);

    const action = (body?.action ?? '').toString().toUpperCase();
    const obsStatus =
      (body?.obsStatus ?? '').toString().trim() || undefined;

    // POD (comprovante de entrega)
    const recebedorNome = (body?.recebedorNome ?? '').toString().trim() || undefined;
    const recebedorDoc = (body?.recebedorDoc ?? '').toString().trim() || undefined;
    const obsEntrega = (body?.obsEntrega ?? '').toString().trim() || undefined;

    if (!['CHECKIN', 'FINALIZAR', 'FALHA'].includes(action)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Ação inválida. Use CHECKIN, FINALIZAR ou FALHA.',
        },
        { status: 400 },
      );
    }

    // Busca a parada + planejamento (se tiver)
    const parada = await prisma.parada.findUnique({
      where: { id },
      include: {
        Planejamento: true,
      },
    });

    if (!parada) {
      return NextResponse.json(
        { ok: false, error: 'Parada não encontrada.' },
        { status: 404 },
      );
    }

    const now = new Date();
    const dataToUpdate: any = {};
    let novoStatusExec: ParadaExecStatus;

    switch (action) {
      case 'CHECKIN':
        novoStatusExec = ParadaExecStatus.EM_ATENDIMENTO;
        dataToUpdate.checkinAt = now;
        break;

      case 'FINALIZAR':
        novoStatusExec = ParadaExecStatus.ENTREGUE;
        dataToUpdate.checkoutAt = now;
        break;

      case 'FALHA':
        novoStatusExec = ParadaExecStatus.FALHA;
        dataToUpdate.checkoutAt = now;
        break;

      default:
        return NextResponse.json(
          {
            ok: false,
            error: 'Ação inválida. Use CHECKIN, FINALIZAR ou FALHA.',
          },
          { status: 400 },
        );
    }

    dataToUpdate.statusExec = novoStatusExec;
    if (obsStatus) {
      dataToUpdate.obsStatus = obsStatus;
    }

    // Salva dados POD na finalização
    if (action === 'FINALIZAR' || action === 'FALHA') {
      if (recebedorNome) dataToUpdate.recebedorNome = recebedorNome;
      if (recebedorDoc) dataToUpdate.recebedorDoc = recebedorDoc;
      if (obsEntrega) dataToUpdate.obsEntrega = obsEntrega;
    }

    // Atualiza a parada
    const paradaAtualizada = await prisma.parada.update({
      where: { id },
      data: dataToUpdate,
    });

    let planejamentoAtualizado = parada.Planejamento;

    // Regras de status do planejamento
    if (parada.Planejamento) {
      const planoId = parada.Planejamento.id;

      // 1) Ao primeiro CHECKIN, se estava PLANNED, vai para IN_TRANSIT
      if (
        action === 'CHECKIN' &&
        parada.Planejamento.status === PlanStatus.PLANNED
      ) {
        planejamentoAtualizado = await prisma.planejamento.update({
          where: { id: planoId },
          data: { status: PlanStatus.IN_TRANSIT },
        });
      }

      // 2) Ao FINALIZAR ou FALHA, se não restar nenhuma parada PENDENTE/EM_ATENDIMENTO,
      //    o planejamento vai para DONE
      if (action === 'FINALIZAR' || action === 'FALHA') {
        const pendentes = await prisma.parada.count({
          where: {
            planejamentoId: planoId,
            id: { not: id },
            statusExec: {
              in: [
                ParadaExecStatus.PENDENTE,
                ParadaExecStatus.EM_ATENDIMENTO,
              ],
            },
          },
        });

        if (pendentes === 0) {
          planejamentoAtualizado = await prisma.planejamento.update({
            where: { id: planoId },
            data: { status: PlanStatus.DONE },
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      parada: paradaAtualizada,
      planejamento: planejamentoAtualizado,
    });
  } catch (err: any) {
    console.error('PATCH /api/paradas/[id]/exec error:', err);
    return NextResponse.json(
      { ok: false, error: 'Erro interno ao atualizar parada.' },
      { status: 500 },
    );
  }
}
