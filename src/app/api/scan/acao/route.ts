// src/app/api/scan/acao/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Resolved =
  | { kind: 'VOLUME'; coletaId: string; etiqueta: string; volumeId: string; itemColetadoId: string }
  | { kind: 'ITEM'; coletaId: string; etiqueta: string; itemColetadoId: string };

function normEtq(raw: string) {
  let s = String(raw || '').trim().toUpperCase();
  if (!s) return '';
  if (s.startsWith('ETQ-')) s = s.slice(4);
  if (s.startsWith('ETQ:')) s = s.slice(4);
  return s.trim().toUpperCase();
}

function etqScan(rawCode: string) {
  const base = normEtq(rawCode);
  return `ETQ:${base}`;
}

async function resolverEtiqueta(tx: typeof prisma, codeRaw: string): Promise<Resolved | null> {
  const raw = String(codeRaw || '').trim();
  if (!raw) return null;

  const norm = normEtq(raw);
  const scanStd = etqScan(raw); // ETQ:<NORM>

  const candidates = Array.from(
    new Set(
      [
        raw,
        raw.toUpperCase(),
        norm,
        norm.toUpperCase(),
        scanStd,
        scanStd.toUpperCase(),
        raw.toUpperCase().startsWith('ETQ-') ? raw.substring(4).trim() : '',
        raw.toUpperCase().startsWith('ETQ:') ? raw.substring(4).trim() : '',
      ].filter(Boolean),
    ),
  );

  // 1) tenta como VOLUME (ItemVolume.etiqueta)
  const vol = await tx.itemVolume.findFirst({
    where: { etiqueta: { in: candidates } },
    select: { id: true, etiqueta: true, itemColetadoId: true },
  });

  if (vol) {
    const item = await tx.itemColetado.findUnique({
      where: { id: vol.itemColetadoId },
      select: { id: true, coletaId: true },
    });
    if (!item) return null;

    return {
      kind: 'VOLUME',
      coletaId: item.coletaId,
      etiqueta: vol.etiqueta,
      volumeId: vol.id,
      itemColetadoId: item.id,
    };
  }

  // 2) tenta como ITEM (ItemColetado.etiqueta)
  const item = await tx.itemColetado.findFirst({
    where: { etiqueta: { in: candidates } },
    select: { id: true, coletaId: true, etiqueta: true },
  });

  if (item) {
    return {
      kind: 'ITEM',
      coletaId: item.coletaId,
      etiqueta: item.etiqueta ?? norm,
      itemColetadoId: item.id,
    };
  }

  return null;
}

async function acharParadaAtiva(tx: typeof prisma, coletaId: string, rotaId?: string | null) {
  const rid = (rotaId || '').trim() || null;

  if (rid) {
    const emAtRota = await tx.parada.findFirst({
      where: { coletaId, rotaId: rid, statusExec: 'EM_ATENDIMENTO' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        statusExec: true,
        checkinAt: true,
        checkoutAt: true,
        rotaId: true,
        planejamentoId: true,
        ordem: true,
        label: true,
        coletaId: true,
      } as any,
    });
    if (emAtRota) return emAtRota;

    const ultimaDaRota = await tx.parada.findFirst({
      where: { coletaId, rotaId: rid },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        statusExec: true,
        checkinAt: true,
        checkoutAt: true,
        rotaId: true,
        planejamentoId: true,
        ordem: true,
        label: true,
        coletaId: true,
      } as any,
    });
    if (ultimaDaRota) return ultimaDaRota;
  }

  const emAt = await tx.parada.findFirst({
    where: { coletaId, statusExec: 'EM_ATENDIMENTO' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      statusExec: true,
      checkinAt: true,
      checkoutAt: true,
      rotaId: true,
      planejamentoId: true,
      ordem: true,
      label: true,
      coletaId: true,
    } as any,
  });
  if (emAt) return emAt;

  const pend = await tx.parada.findFirst({
    where: { coletaId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      statusExec: true,
      checkinAt: true,
      checkoutAt: true,
      rotaId: true,
      planejamentoId: true,
      ordem: true,
      label: true,
      coletaId: true,
    } as any,
  });
  return pend;
}

async function montarResumoColeta(tx: typeof prisma, coletaId: string) {
  const coleta = await tx.coleta.findUnique({
    where: { id: coletaId },
    select: {
      id: true,
      nf: true,
      cidade: true,
      uf: true,
      Cliente: { select: { id: true, razao: true } },
    },
  });

  return coleta
    ? {
        id: coleta.id,
        nf: coleta.nf ?? null,
        cidade: coleta.cidade ?? null,
        uf: coleta.uf ?? null,
        cliente: coleta.Cliente?.razao ?? null,
      }
    : null;
}

async function aplicarSaidaPatioSePrecisar(tx: typeof prisma, coletaId: string, codeRaw: string) {
  const c = await tx.coleta.findUnique({
    where: { id: coletaId },
    select: { id: true, status: true, entradaPatioAt: true, embarqueAt: true, fimPatioAt: true },
  });

  if (!c) return { updated: false, coleta: null as any };

  const jaTemFim = !!(c.fimPatioAt || c.embarqueAt);
  const elegivel = c.status === 'EM_PATIO' && !jaTemFim;

  if (!elegivel) {
    return {
      updated: false,
      coleta: {
        id: c.id,
        status: c.status,
        entradaPatioAt: c.entradaPatioAt ?? null,
        embarqueAt: c.embarqueAt ?? null,
        fimPatioAt: c.fimPatioAt ?? null,
      },
    };
  }

  const now = new Date();

  const updated = await tx.coleta.update({
    where: { id: coletaId },
    data: { embarqueAt: now, fimPatioAt: now, status: 'CARREGADA' },
    select: { id: true, status: true, entradaPatioAt: true, embarqueAt: true, fimPatioAt: true },
  });

  try {
    await tx.scanEvent.create({
      data: {
        etiqueta: etqScan(codeRaw),
        status: 'PATIO_EXIT_AUTO',
        note: `Saída do pátio automática via scan (coletaId=${coletaId})`,
      },
    });
  } catch {}

  return {
    updated: true,
    coleta: {
      id: updated.id,
      status: updated.status,
      entradaPatioAt: updated.entradaPatioAt ?? null,
      embarqueAt: updated.embarqueAt ?? null,
      fimPatioAt: updated.fimPatioAt ?? null,
    },
  };
}

async function aplicarScanNoVolumeSePrecisar(
  tx: typeof prisma,
  resolved: Resolved,
  coletaStatusFinal: 'EM_PATIO' | 'CARREGADA' | 'EM_TRANSITO' | 'ENTREGUE',
  codeRaw: string,
  meta?: { rotaId?: string | null; paradaId?: string | null; acao?: string },
) {
  const now = new Date();

  // ✅ VOLUME: atualiza por ID (zero dor de cabeça com prefixo/caixa)
  if (resolved.kind === 'VOLUME') {
    await tx.itemVolume.updateMany({
      where: { id: resolved.volumeId, scannedAt: null },
      data: { scannedAt: now },
    });

    await tx.itemVolume.updateMany({
      where: { id: resolved.volumeId },
      data: { status: coletaStatusFinal },
    });

    try {
      await tx.scanEvent.create({
        data: {
          etiqueta: etqScan(codeRaw),
          status: 'VOLUME_SCANNED',
          note: `ItemVolume atualizado via scan: volumeId=${resolved.volumeId} etiqueta=${resolved.etiqueta} status=${coletaStatusFinal} rotaId=${meta?.rotaId ?? '-'} paradaId=${meta?.paradaId ?? '-'} acao=${meta?.acao ?? '-'}`,
        },
      });
    } catch {}
    return;
  }

  // ✅ ITEM: atualiza todos os volumes do item; se não existir, cria placeholder
  if (resolved.kind === 'ITEM') {
    const existingCount = await tx.itemVolume.count({
      where: { itemColetadoId: resolved.itemColetadoId },
    });

    if (existingCount === 0) {
      const etiquetaNorm = normEtq(codeRaw); // padrão do banco (sem ETQ:)
      if (etiquetaNorm) {
        try {
          await tx.itemVolume.create({
            data: {
              itemColetadoId: resolved.itemColetadoId,
              etiqueta: etiquetaNorm,
              scannedAt: now,
              status: coletaStatusFinal,
              // componenteId: null (não inferimos aqui)
            },
          });
        } catch {}
      }
    }

    await tx.itemVolume.updateMany({
      where: { itemColetadoId: resolved.itemColetadoId, scannedAt: null },
      data: { scannedAt: now },
    });

    await tx.itemVolume.updateMany({
      where: { itemColetadoId: resolved.itemColetadoId },
      data: { status: coletaStatusFinal },
    });

    try {
      await tx.scanEvent.create({
        data: {
          etiqueta: etqScan(codeRaw),
          status: 'ITEM_SCANNED',
          note: `ItemColetado/volumes atualizados via scan: itemColetadoId=${resolved.itemColetadoId} status=${coletaStatusFinal} rotaId=${meta?.rotaId ?? '-'} paradaId=${meta?.paradaId ?? '-'} acao=${meta?.acao ?? '-'}`,
        },
      });
    } catch {}
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const code = String(body?.code || '').trim();
    const mode = String(body?.mode || 'AUTO').toUpperCase();
    const rotaId = (body?.rotaId ? String(body.rotaId) : '').trim() || null;

    if (!code) {
      return NextResponse.json({ ok: false, error: 'Campo "code" é obrigatório.' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const resolved = await resolverEtiqueta(tx as any, code);
      if (!resolved) {
        return { ok: false, status: 404, error: 'Etiqueta não encontrada (ItemVolume.etiqueta ou ItemColetado.etiqueta).' };
      }

      const patio = await aplicarSaidaPatioSePrecisar(tx as any, resolved.coletaId, code);

      const parada = await acharParadaAtiva(tx as any, resolved.coletaId, rotaId);
      if (!parada) {
        return { ok: false, status: 404, error: 'Parada não encontrada para esta coleta. Vincule no planejamento e gere rota.', patio };
      }

      const coletaResumo = await montarResumoColeta(tx as any, resolved.coletaId);

      let coletaStatusFinal: 'EM_PATIO' | 'CARREGADA' | 'EM_TRANSITO' | 'ENTREGUE' =
        (patio?.coleta?.status as any) ?? 'EM_PATIO';

      if (parada.statusExec === 'ENTREGUE') {
        await aplicarScanNoVolumeSePrecisar(tx as any, resolved, coletaStatusFinal, code, {
          rotaId: parada.rotaId ?? null,
          paradaId: parada.id,
          acao: 'JA_ENTREGUE',
        });

        try {
          await tx.scanEvent.create({
            data: {
              etiqueta: etqScan(code),
              status: 'SCAN_JA_ENTREGUE',
              note: `Scan em parada já ENTREGUE (rotaId=${parada.rotaId ?? '-'} paradaId=${parada.id} coletaId=${resolved.coletaId})`,
            },
          });
        } catch {}

        return {
          ok: true,
          acao: 'JA_ENTREGUE' as const,
          action: 'STATUS' as const,
          message: 'Coleta já está ENTREGUE (idempotente).',
          rotaId: parada.rotaId ?? null,
          paradaId: parada.id,
          statusExec: parada.statusExec,
          checkinAt: parada.checkinAt ?? null,
          checkoutAt: parada.checkoutAt ?? null,
          label: (parada as any).label ?? null,
          ordem: (parada as any).ordem ?? null,
          coleta: coletaResumo,
          patio,
          resolved,
          parada,
        };
      }

      let acaoFinal: 'CHECKIN' | 'CHECKOUT';
      if (mode === 'CHECKIN') acaoFinal = 'CHECKIN';
      else if (mode === 'CHECKOUT') acaoFinal = 'CHECKOUT';
      else acaoFinal = parada.statusExec === 'PENDENTE' ? 'CHECKIN' : 'CHECKOUT';

      if (acaoFinal === 'CHECKIN') {
        const updatedParada = await tx.parada.update({
          where: { id: parada.id },
          data: {
            statusExec: 'EM_ATENDIMENTO',
            checkinAt: parada.checkinAt ?? new Date(),
            obsStatus: null,
          },
          select: {
            id: true,
            statusExec: true,
            checkinAt: true,
            checkoutAt: true,
            rotaId: true,
            planejamentoId: true,
            ordem: true,
            label: true,
            coletaId: true,
          } as any,
        });

        try {
          const c = await tx.coleta.findUnique({
            where: { id: resolved.coletaId },
            select: { status: true },
          });

          if (c?.status === 'CARREGADA') {
            const c2 = await tx.coleta.update({
              where: { id: resolved.coletaId },
              data: { status: 'EM_TRANSITO' },
              select: { status: true },
            });
            coletaStatusFinal = c2.status as any;

            try {
              await tx.scanEvent.create({
                data: {
                  etiqueta: etqScan(code),
                  status: 'COLETA_STATUS',
                  note: `Coleta status alterado via CHECKIN: CARREGADA -> EM_TRANSITO (coletaId=${resolved.coletaId})`,
                },
              });
            } catch {}
          } else {
            coletaStatusFinal = (c?.status as any) ?? coletaStatusFinal;
          }
        } catch {}

        await aplicarScanNoVolumeSePrecisar(tx as any, resolved, coletaStatusFinal, code, {
          rotaId: updatedParada.rotaId ?? null,
          paradaId: updatedParada.id,
          acao: 'CHECKIN',
        });

        try {
          await tx.scanEvent.create({
            data: {
              etiqueta: etqScan(code),
              status: 'SCAN_CHECKIN',
              note: `Check-in via scan (rotaId=${updatedParada.rotaId ?? '-'} paradaId=${updatedParada.id} coletaId=${resolved.coletaId} mode=${mode})`,
            },
          });
        } catch {}

        return {
          ok: true,
          acao: 'CHECKIN' as const,
          action: 'CHECKIN' as const,
          message: 'Check-in realizado.',
          rotaId: updatedParada.rotaId ?? null,
          paradaId: updatedParada.id,
          statusExec: updatedParada.statusExec,
          checkinAt: updatedParada.checkinAt ?? null,
          checkoutAt: updatedParada.checkoutAt ?? null,
          label: (updatedParada as any).label ?? null,
          ordem: (updatedParada as any).ordem ?? null,
          coleta: coletaResumo,
          patio,
          resolved,
          parada: updatedParada,
        };
      }

      const updatedParada = await tx.parada.update({
        where: { id: parada.id },
        data: { statusExec: 'ENTREGUE', checkoutAt: new Date() },
        select: {
          id: true,
          statusExec: true,
          checkinAt: true,
          checkoutAt: true,
          rotaId: true,
          planejamentoId: true,
          ordem: true,
          label: true,
          coletaId: true,
        } as any,
      });

      try {
        const c2 = await tx.coleta.update({
          where: { id: resolved.coletaId },
          data: { status: 'ENTREGUE' },
          select: { status: true },
        });
        coletaStatusFinal = c2.status as any;

        try {
          await tx.scanEvent.create({
            data: {
              etiqueta: etqScan(code),
              status: 'COLETA_STATUS',
              note: `Coleta status alterado via CHECKOUT: -> ENTREGUE (coletaId=${resolved.coletaId})`,
            },
          });
        } catch {}
      } catch {}

      await aplicarScanNoVolumeSePrecisar(tx as any, resolved, coletaStatusFinal, code, {
        rotaId: updatedParada.rotaId ?? null,
        paradaId: updatedParada.id,
        acao: 'CHECKOUT',
      });

      try {
        await tx.scanEvent.create({
          data: {
            etiqueta: etqScan(code),
            status: 'SCAN_CHECKOUT',
            note: `Check-out via scan (rotaId=${updatedParada.rotaId ?? '-'} paradaId=${updatedParada.id} coletaId=${resolved.coletaId} mode=${mode})`,
          },
        });
      } catch {}

      return {
        ok: true,
        acao: 'CHECKOUT' as const,
        action: 'CHECKOUT' as const,
        message: 'Check-out realizado. Entrega concluída.',
        rotaId: updatedParada.rotaId ?? null,
        paradaId: updatedParada.id,
        statusExec: updatedParada.statusExec,
        checkinAt: updatedParada.checkinAt ?? null,
        checkoutAt: updatedParada.checkoutAt ?? null,
        label: (updatedParada as any).label ?? null,
        ordem: (updatedParada as any).ordem ?? null,
        coleta: coletaResumo,
        patio,
        resolved,
        parada: updatedParada,
      };
    });

    if ((result as any)?.ok === false && (result as any)?.status) {
      return NextResponse.json(result, { status: (result as any).status });
    }

    return NextResponse.json(result);
  } catch (e: any) {
    console.error('POST /api/scan/acao error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erro interno no scan/acao.' }, { status: 500 });
  }
}