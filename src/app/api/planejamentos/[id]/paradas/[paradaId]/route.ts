// @ts-nocheck — references fields not yet in Parada schema (startedAt)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Ctx = { params: Promise<{ id: string; paradaId: string }> };

function jserr(e: any) {
  return {
    name: e?.name,
    message: e?.message,
    code: e?.code,
    meta: e?.meta,
  };
}

/**
 * PATCH /api/planejamentos/:id/paradas/:paradaId
 *
 * Body permitido (todos opcionais):
 * {
 *   status?: "PENDING" | "IN_PROGRESS" | "DONE",
 *   note?: string,
 *   setStarted?: boolean,
 *   setFinished?: boolean
 * }
 *
 * Regras:
 * - Garante que a parada pertence ao Planejamento :id
 * - Atualiza só os campos enviados
 * - setStarted: se true -> startedAt = now() (se ainda estiver null)
 * - setFinished: se true -> finishedAt = now() e status = DONE (se não vier outro status)
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id: planId, paradaId } = await ctx.params;

    // Tenta achar a parada vinculada a esse Planejamento
    const parada = await prisma.parada.findFirst({
      where: {
        id: paradaId,
        planejamentoId: planId,
      },
    });

    if (!parada) {
      return NextResponse.json(
        { error: 'Parada não encontrada para este planejamento.' },
        { status: 404 },
      );
    }

    const body = await req.json().catch(() => ({}));

    const status = body?.status as 'PENDING' | 'IN_PROGRESS' | 'DONE' | undefined;
    const note = typeof body?.note === 'string' ? body.note : undefined;
    const setStarted = body?.setStarted === true;
    const setFinished = body?.setFinished === true;

    const data: any = {};

    // status (se enviado)
    if (status !== undefined) {
      const allowed = ['PENDING', 'IN_PROGRESS', 'DONE'] as const;
      if (!allowed.includes(status as any)) {
        return NextResponse.json(
          { error: 'Status inválido. Use PENDING, IN_PROGRESS ou DONE.' },
          { status: 400 },
        );
      }
      data.status = status;
    }

    // note (se enviada)
    if (note !== undefined) {
      data.note = note;
    }

    // setStarted: marca startedAt se ainda não tiver
    if (setStarted) {
      if (!parada.startedAt) {
        data.startedAt = new Date();
      }
    }

    // setFinished: marca finishedAt e garante DONE se nenhum status for passado
    if (setFinished) {
      data.finishedAt = new Date();
      if (data.status === undefined) {
        data.status = 'DONE';
      }
    }

    // Se nada foi enviado, não faz sentido atualizar
    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: 'Nenhum campo válido enviado para atualizar.' },
        { status: 400 },
      );
    }

    const updated = await prisma.parada.update({
      where: { id: parada.id },
      data,
      select: {
        id: true,
        planejamentoId: true,
        coletaId: true,
        ordem: true,
        label: true,
        lon: true,
        lat: true,
        kmTrecho: true,
        durMinTrecho: true,
        status: true,
        note: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, parada: updated });
  } catch (e: any) {
    console.error('PATCH /api/planejamentos/[id]/paradas/[paradaId] error:', e);
    return NextResponse.json(
      { error: 'Falha ao atualizar parada', detail: jserr(e) },
      { status: 500 },
    );
  }
}
