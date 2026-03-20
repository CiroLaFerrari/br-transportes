import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  // Next 15: params é Promise
  params: Promise<{ id: string }>;
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function diffMs(a?: Date | null, b?: Date | null) {
  if (!a || !b) return null;
  return a.getTime() - b.getTime();
}

function msToHours(ms: number) {
  return Math.round((ms / (1000 * 60 * 60)) * 100) / 100;
}

function msToDays(ms: number) {
  return Math.round((ms / (1000 * 60 * 60 * 24)) * 100) / 100;
}

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const coletaId = String(id || '').trim();
    if (!coletaId) return json({ ok: false, error: 'Parâmetro id é obrigatório.' }, 400);

    const coleta = await prisma.coleta.findUnique({
      where: { id: coletaId },
      include: {
        Cliente: { select: { id: true, razao: true, cidade: true, uf: true } },
        itens: {
          include: {
            Produto: { select: { id: true, code: true, descricao: true, pesoKg: true } },
            volumes: { select: { id: true } },
          },
        },
        paradas: {
          select: {
            id: true,
            ordem: true,
            label: true,
            statusExec: true,
            checkinAt: true,
            checkoutAt: true,
            rotaId: true,
          },
          orderBy: { ordem: 'asc' },
        },
      },
    });

    if (!coleta) return json({ ok: false, error: 'Coleta não encontrada.' }, 404);

    const entrada = coleta.entradaPatioAt ?? null;

    // término “oficial” do pátio: fimPatioAt OU embarqueAt
    const fim = (coleta.fimPatioAt ?? coleta.embarqueAt) ?? null;

    const now = new Date();

    const msAteAgora = entrada ? diffMs(now, entrada) : null;
    const msFinal = entrada && fim ? diffMs(fim, entrada) : null;

    return json({
      ok: true,
      coleta,
      leadTimePatio: {
        inicio: entrada,
        fim: fim,
        msAteAgora,
        horasAteAgora: msAteAgora != null ? msToHours(msAteAgora) : null,
        diasAteAgora: msAteAgora != null ? msToDays(msAteAgora) : null,
        msFinal,
        horasFinal: msFinal != null ? msToHours(msFinal) : null,
        diasFinal: msFinal != null ? msToDays(msFinal) : null,
      },
    });
  } catch (e: any) {
    console.error('GET /api/coletas/[id] error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno.' }, 500);
  }
}

/**
 * PATCH /api/coletas/[id]
 * Body pode ser:
 * - { action: "MARCAR_SAIDA_PATIO" }
 * - { action: "MARCAR_ENTRADA_PATIO" }
 * - ou campos para update: nf, cidade, uf, valorFrete, pesoTotalKg, clienteId, status, entradaPatioAt, embarqueAt, fimPatioAt
 */
export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const coletaId = String(id || '').trim();
    if (!coletaId) return json({ ok: false, error: 'Parâmetro id é obrigatório.' }, 400);

    const body = await req.json().catch(() => null);
    if (!body) return json({ ok: false, error: 'Body inválido.' }, 400);

    const action = String(body?.action || '').trim().toUpperCase();

    // ações prontas
    if (action === 'MARCAR_SAIDA_PATIO') {
      const now = new Date();

      const updated = await prisma.coleta.update({
        where: { id: coletaId },
        data: {
          embarqueAt: now,
          fimPatioAt: now,
          status: 'CARREGADA',
        },
        include: {
          Cliente: { select: { id: true, razao: true } },
        },
      });

      // ✅ LOG (não pode quebrar o fluxo)
      try {
        await prisma.scanEvent.create({
          data: {
            etiqueta: `COLETA:${coletaId}`,
            status: 'PATIO_EXIT_MANUAL',
            note: 'Saída do pátio marcada manualmente (PATCH MARCAR_SAIDA_PATIO)',
          },
        });
      } catch {}

      return json({ ok: true, updated });
    }

    if (action === 'MARCAR_ENTRADA_PATIO') {
      const now = new Date();

      const updated = await prisma.coleta.update({
        where: { id: coletaId },
        data: {
          entradaPatioAt: now,
          status: 'EM_PATIO',
        },
        include: {
          Cliente: { select: { id: true, razao: true } },
        },
      });

      // ✅ LOG (não pode quebrar o fluxo)
      try {
        await prisma.scanEvent.create({
          data: {
            etiqueta: `COLETA:${coletaId}`,
            status: 'PATIO_ENTRY_MANUAL',
            note: 'Entrada no pátio marcada manualmente (PATCH MARCAR_ENTRADA_PATIO)',
          },
        });
      } catch {}

      return json({ ok: true, updated });
    }

    // update “normal”
    const dataToUpdate: any = {};

    if (body?.nf !== undefined) {
      const v = String(body.nf || '').trim();
      if (!v) return json({ ok: false, error: 'nf não pode ser vazio.' }, 400);
      dataToUpdate.nf = v;
    }

    if (body?.cidade !== undefined) {
      const v = String(body.cidade || '').trim();
      if (!v) return json({ ok: false, error: 'cidade não pode ser vazia.' }, 400);
      dataToUpdate.cidade = v;
    }

    if (body?.uf !== undefined) {
      const v = String(body.uf || '').trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(v)) return json({ ok: false, error: 'UF inválida (2 letras).' }, 400);
      dataToUpdate.uf = v;
    }

    if (body?.valorFrete !== undefined) {
      const v = Number(typeof body.valorFrete === 'string' ? body.valorFrete.replace(',', '.') : body.valorFrete);
      if (!Number.isFinite(v)) return json({ ok: false, error: 'valorFrete inválido.' }, 400);
      dataToUpdate.valorFrete = v;
    }

    if (body?.pesoTotalKg !== undefined) {
      const v = Number(typeof body.pesoTotalKg === 'string' ? body.pesoTotalKg.replace(',', '.') : body.pesoTotalKg);
      if (!Number.isFinite(v)) return json({ ok: false, error: 'pesoTotalKg inválido.' }, 400);
      dataToUpdate.pesoTotalKg = v;
    }

    if (body?.clienteId !== undefined) {
      const v = String(body.clienteId || '').trim();
      if (!v) return json({ ok: false, error: 'clienteId não pode ser vazio.' }, 400);

      const cli = await prisma.cliente.findUnique({ where: { id: v }, select: { id: true } });
      if (!cli) return json({ ok: false, error: 'clienteId inexistente.' }, 400);

      dataToUpdate.clienteId = v;
    }

    if (body?.status !== undefined) {
      const v = String(body.status || '').trim().toUpperCase();
      // ColetaStatus: EM_PATIO | CARREGADA | EM_TRANSITO | ENTREGUE
      if (!['EM_PATIO', 'CARREGADA', 'EM_TRANSITO', 'ENTREGUE'].includes(v)) {
        return json({ ok: false, error: 'status inválido para Coleta.' }, 400);
      }
      dataToUpdate.status = v;
    }

    // datas (opcionais)
    if (body?.entradaPatioAt !== undefined) {
      const v = body.entradaPatioAt ? new Date(body.entradaPatioAt) : null;
      if (v && isNaN(v.getTime())) return json({ ok: false, error: 'entradaPatioAt inválido.' }, 400);
      dataToUpdate.entradaPatioAt = v;
    }

    if (body?.embarqueAt !== undefined) {
      const v = body.embarqueAt ? new Date(body.embarqueAt) : null;
      if (v && isNaN(v.getTime())) return json({ ok: false, error: 'embarqueAt inválido.' }, 400);
      dataToUpdate.embarqueAt = v;
    }

    if (body?.fimPatioAt !== undefined) {
      const v = body.fimPatioAt ? new Date(body.fimPatioAt) : null;
      if (v && isNaN(v.getTime())) return json({ ok: false, error: 'fimPatioAt inválido.' }, 400);
      dataToUpdate.fimPatioAt = v;
    }

    if (body?.prazoEntrega !== undefined) {
      const v = body.prazoEntrega ? new Date(body.prazoEntrega) : null;
      if (v && isNaN(v.getTime())) return json({ ok: false, error: 'prazoEntrega inválido.' }, 400);
      dataToUpdate.prazoEntrega = v;
    }

    if (body?.urgencia !== undefined) {
      const v = String(body.urgencia || '').trim().toUpperCase();
      if (!['NORMAL', 'ALTA', 'URGENTE'].includes(v)) {
        return json({ ok: false, error: 'urgencia inválida (NORMAL, ALTA, URGENTE).' }, 400);
      }
      dataToUpdate.urgencia = v;
    }

    if (body?.minutaId !== undefined) {
      dataToUpdate.minutaId = body.minutaId ? String(body.minutaId).trim() : null;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return json({ ok: false, error: 'Nenhum campo válido informado.' }, 400);
    }

    const updated = await prisma.coleta.update({
      where: { id: coletaId },
      data: dataToUpdate,
      include: {
        Cliente: { select: { id: true, razao: true } },
      },
    });

    return json({ ok: true, updated });
  } catch (e: any) {
    console.error('PATCH /api/coletas/[id] error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno.' }, 500);
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const coletaId = String(id || '').trim();
    if (!coletaId) return json({ ok: false, error: 'Parâmetro id é obrigatório.' }, 400);

    await prisma.coleta.delete({ where: { id: coletaId } });
    return json({ ok: true });
  } catch (e: any) {
    console.error('DELETE /api/coletas/[id] error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno.' }, 500);
  }
}
