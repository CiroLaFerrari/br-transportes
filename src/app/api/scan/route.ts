import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = (searchParams.get('code') || searchParams.get('etiqueta') || '').trim();

    if (!raw) return json({ ok: false, error: 'Informe ?code=... (ou ?etiqueta=...)' }, 400);

    const code = raw;

    // 1) Tenta ItemVolume (novo fluxo)
    const vol = await prisma.itemVolume.findFirst({
      where: { etiqueta: code },
      select: {
        id: true,
        etiqueta: true,
        itemColetadoId: true,
        componenteId: true,
        // scannedAt/status se existirem no schema - não seleciono aqui pra não quebrar
      },
    });

    if (vol) {
      // tenta marcar scannedAt/status sem quebrar se não existir
      try {
        await (prisma.itemVolume.update as any)({
          where: { id: vol.id },
          data: { scannedAt: new Date(), status: 'SCANEADO' },
        });
      } catch {}

      // log
      try {
        await prisma.scanEvent.create({
          data: { etiqueta: vol.etiqueta, status: 'SCANNED_VOLUME', note: 'Scan via /api/scan' },
        });
      } catch {}

      const item = await prisma.itemColetado.findUnique({
        where: { id: vol.itemColetadoId },
        include: {
          Produto: true,
          Coleta: { include: { Cliente: true } },
        },
      });

      const componente = vol.componenteId
        ? await prisma.componente.findUnique({
            where: { id: vol.componenteId },
            select: { id: true, codigo: true, nome: true },
          })
        : null;

      return json({
        ok: true,
        type: 'VOLUME',
        code,
        volume: vol,
        componente,
        item: item
          ? {
              id: item.id,
              quantidade: item.quantidade,
              produto: item.Produto ? { id: item.Produto.id, codigo: item.Produto.code, descricao: item.Produto.descricao } : null,
            }
          : null,
        coleta: item?.Coleta
          ? {
              id: item.Coleta.id,
              nf: item.Coleta.nf,
              cidade: item.Coleta.cidade,
              uf: item.Coleta.uf,
              cliente: item.Coleta.Cliente ? { id: item.Coleta.Cliente.id, razao: item.Coleta.Cliente.razao } : null,
            }
          : null,
      });
    }

    // 2) Se não achou volume, tenta ItemColetado (fluxo antigo/atual do seu debug)
    const item = await prisma.itemColetado.findFirst({
      where: { etiqueta: code },
      include: {
        Produto: true,
        Coleta: { include: { Cliente: true } },
      },
    });

    if (!item) return json({ ok: false, error: 'Etiqueta não encontrada (nem Volume nem Item).' }, 404);

    // log
    try {
      await prisma.scanEvent.create({
        data: { etiqueta: item.etiqueta, status: 'SCANNED_ITEM', note: 'Scan via /api/scan' },
      });
    } catch {}

    return json({
      ok: true,
      type: 'ITEM',
      code,
      item: {
        id: item.id,
        etiqueta: item.etiqueta,
        quantidade: item.quantidade,
        produto: item.Produto ? { id: item.Produto.id, codigo: item.Produto.code, descricao: item.Produto.descricao } : null,
      },
      coleta: item.Coleta
        ? {
            id: item.Coleta.id,
            nf: item.Coleta.nf,
            cidade: item.Coleta.cidade,
            uf: item.Coleta.uf,
            cliente: item.Coleta.Cliente ? { id: item.Coleta.Cliente.id, razao: item.Coleta.Cliente.razao } : null,
          }
        : null,
    });
  } catch (e: any) {
    console.error('GET /api/scan error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno no scan.' }, 500);
  }
}
