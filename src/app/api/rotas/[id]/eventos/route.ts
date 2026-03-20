import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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

function etqColeta(coletaId: string) {
  const id = String(coletaId || '').trim();
  return `COLETA:${id}`;
}

/**
 * GET /api/rotas/:id/eventos?limit=200
 *
 * Retorna ScanEvent relacionados à rota:
 * - COLETA:<coletaId> (ações manuais da coleta)
 * - ETQ:<etiqueta> (scans de volumes/itens daquelas coletas)
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const rotaId = String(id || '').trim();
    if (!rotaId) return NextResponse.json({ ok: false, error: 'id inválido' }, { status: 400 });

    const url = new URL(req.url);
    const limitRaw = url.searchParams.get('limit') || '200';
    let limit = Number(limitRaw);
    if (!Number.isFinite(limit) || limit <= 0) limit = 200;
    limit = Math.min(limit, 1000);

    // 1) pega rota e coletas da rota
    const rota = await prisma.rota.findUnique({
      where: { id: rotaId },
      select: {
        id: true,
        dataRota: true,
        status: true,
        paradas: { select: { coletaId: true } },
      },
    });

    if (!rota) return NextResponse.json({ ok: false, error: 'Rota não encontrada' }, { status: 404 });

    const coletaIds = Array.from(new Set((rota.paradas || []).map((p) => p.coletaId).filter(Boolean)));

    if (coletaIds.length === 0) {
      return NextResponse.json({
        ok: true,
        rota: { id: rota.id, dataRota: rota.dataRota, status: rota.status },
        totalColetas: 0,
        limit,
        eventos: [],
      });
    }

    // 2) monta lista de etiquetas de auditoria (COLETA:<id> e ETQ:<...>)
    const etiquetas = new Set<string>();

    // COLETA:<id>
    for (const cid of coletaIds) etiquetas.add(etqColeta(cid));

    // ETQ:<volumes/itens> dessas coletas
    const itens = await prisma.itemColetado.findMany({
      where: { coletaId: { in: coletaIds } },
      select: {
        etiqueta: true,
        volumes: { select: { etiqueta: true } },
      },
    });

    for (const it of itens) {
      if (it.etiqueta) etiquetas.add(etqScan(it.etiqueta));
      for (const v of it.volumes || []) {
        if (v?.etiqueta) etiquetas.add(etqScan(v.etiqueta));
      }
    }

    const etiquetaList = Array.from(etiquetas);

    // 3) busca eventos
    const eventos = await prisma.scanEvent.findMany({
      where: { etiqueta: { in: etiquetaList } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        etiqueta: true,
        status: true,
        note: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      rota: { id: rota.id, dataRota: rota.dataRota, status: rota.status },
      totalColetas: coletaIds.length,
      limit,
      eventos,
    });
  } catch (e: any) {
    console.error('GET /api/rotas/[id]/eventos error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erro interno' }, { status: 500 });
  }
}
