import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params; // ✅ Next exige await em dynamic params
    const planejamentoId = String(id || '').trim();
    if (!planejamentoId) {
      return NextResponse.json({ ok: false, error: 'planejamentoId inválido' }, { status: 400 });
    }

    // body opcional
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const resetStatusParadas = Boolean(body?.resetStatusParadas);

    // existe planejamento?
    const planejamento = await prisma.planejamento.findUnique({
      where: { id: planejamentoId },
      select: { id: true, name: true },
    });

    if (!planejamento) {
      return NextResponse.json({ ok: false, error: 'Planejamento não encontrado' }, { status: 404 });
    }

    // carrega paradas do planejamento
    const paradas = await prisma.parada.findMany({
      where: { planejamentoId },
      orderBy: { ordem: 'asc' },
      select: {
        id: true,
        ordem: true,
        coletaId: true,
        rotaId: true,
        statusExec: true,
        checkinAt: true,
        checkoutAt: true,
      },
    });

    if (!paradas.length) {
      return NextResponse.json(
        { ok: false, error: 'Planejamento sem paradas. Vincule coletas antes de gerar a rota.' },
        { status: 400 },
      );
    }

    // rotaId(s) já presentes nas paradas
    const rotaIds = Array.from(new Set(paradas.map(p => p.rotaId).filter(Boolean))) as string[];

    // helper: resetar paradas
    async function resetarParadas(rotaId: string) {
      await prisma.parada.updateMany({
        where: { planejamentoId },
        data: {
          rotaId,
          statusExec: 'PENDENTE',
          checkinAt: null,
          checkoutAt: null,
          obsStatus: null,
        },
      });

      await prisma.rota.update({
        where: { id: rotaId },
        data: { status: 'PLANEJADA' },
      });
    }

    // Caso 1: já existe exatamente 1 rota → retorna ela (e opcionalmente reseta)
    if (rotaIds.length === 1) {
      const rotaId = rotaIds[0];

      const rota = await prisma.rota.findUnique({
        where: { id: rotaId },
        select: { id: true, dataRota: true, status: true },
      });

      if (!rota) {
        // inconsistência: paradas apontam pra rota inexistente → cria nova rota e reata
        const nova = await prisma.rota.create({
          data: { dataRota: new Date(), status: 'PLANEJADA' },
          select: { id: true, dataRota: true, status: true },
        });

        await prisma.parada.updateMany({
          where: { planejamentoId },
          data: {
            rotaId: nova.id,
            ...(resetStatusParadas
              ? { statusExec: 'PENDENTE', checkinAt: null, checkoutAt: null, obsStatus: null }
              : {}),
          },
        });

        const paradasAtual = await prisma.parada.findMany({
          where: { planejamentoId },
          orderBy: { ordem: 'asc' },
          select: {
            id: true,
            ordem: true,
            coletaId: true,
            statusExec: true,
            checkinAt: true,
            checkoutAt: true,
            rotaId: true,
          },
        });

        return NextResponse.json({
          ok: true,
          info: 'Rota recriada (rotaId antiga inconsistente).',
          planejamento: { id: planejamento.id, name: planejamento.name },
          rota: nova,
          totalParadas: paradasAtual.length,
          paradas: paradasAtual,
        });
      }

      if (resetStatusParadas) {
        await resetarParadas(rotaId);
      }

      const paradasAtual = await prisma.parada.findMany({
        where: { planejamentoId },
        orderBy: { ordem: 'asc' },
        select: {
          id: true,
          ordem: true,
          coletaId: true,
          statusExec: true,
          checkinAt: true,
          checkoutAt: true,
          rotaId: true,
        },
      });

      return NextResponse.json({
        ok: true,
        info: rota.status ? 'Rota existente retornada.' : 'Rota existente retornada.',
        planejamento: { id: planejamento.id, name: planejamento.name },
        rota,
        totalParadas: paradasAtual.length,
        paradas: paradasAtual,
      });
    }

    // Caso 2: existem múltiplas rotaId nas paradas (inconsistência)
    // Para manter "seguro", vamos criar nova rota e reata tudo nela (se resetStatusParadas=true)
    if (rotaIds.length > 1) {
      if (!resetStatusParadas) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'Conflito: paradas deste planejamento estão vinculadas a múltiplas rotas. Envie resetStatusParadas=true para normalizar.',
            rotaIds,
          },
          { status: 409 },
        );
      }

      const nova = await prisma.rota.create({
        data: { dataRota: new Date(), status: 'PLANEJADA' },
        select: { id: true, dataRota: true, status: true },
      });

      await prisma.parada.updateMany({
        where: { planejamentoId },
        data: {
          rotaId: nova.id,
          statusExec: 'PENDENTE',
          checkinAt: null,
          checkoutAt: null,
          obsStatus: null,
        },
      });

      const paradasAtual = await prisma.parada.findMany({
        where: { planejamentoId },
        orderBy: { ordem: 'asc' },
        select: {
          id: true,
          ordem: true,
          coletaId: true,
          statusExec: true,
          checkinAt: true,
          checkoutAt: true,
          rotaId: true,
        },
      });

      return NextResponse.json({
        ok: true,
        info: 'Normalizado: múltiplas rotas detectadas, nova rota criada e paradas reatribuídas.',
        planejamento: { id: planejamento.id, name: planejamento.name },
        rota: nova,
        totalParadas: paradasAtual.length,
        paradas: paradasAtual,
      });
    }

    // Caso 3: nenhuma rota ainda → cria rota e vincula paradas
    const rotaNova = await prisma.rota.create({
      data: { dataRota: new Date(), status: 'PLANEJADA' },
      select: { id: true, dataRota: true, status: true },
    });

    await prisma.parada.updateMany({
      where: { planejamentoId },
      data: {
        rotaId: rotaNova.id,
        ...(resetStatusParadas
          ? { statusExec: 'PENDENTE', checkinAt: null, checkoutAt: null, obsStatus: null }
          : {}),
      },
    });

    const paradasAtual = await prisma.parada.findMany({
      where: { planejamentoId },
      orderBy: { ordem: 'asc' },
      select: {
        id: true,
        ordem: true,
        coletaId: true,
        statusExec: true,
        checkinAt: true,
        checkoutAt: true,
        rotaId: true,
      },
    });

    return NextResponse.json({
      ok: true,
      info: 'Rota criada e paradas vinculadas.',
      planejamento: { id: planejamento.id, name: planejamento.name },
      rota: rotaNova,
      totalParadas: paradasAtual.length,
      paradas: paradasAtual,
    });
  } catch (err: any) {
    console.error('POST /api/planejamentos/[id]/gerar-rota error:', err);
    return NextResponse.json(
      { ok: false, error: 'Erro interno ao gerar rota.' },
      { status: 500 },
    );
  }
}
