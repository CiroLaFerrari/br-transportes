// src/app/api/planejamentos/validar/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// cm -> m3
function calcM3FromCm(alt: number | null, larg: number | null, comp: number | null): number {
  if (alt == null || larg == null || comp == null) return 0;
  const a = Number(alt);
  const l = Number(larg);
  const c = Number(comp);
  if (![a, l, c].every(Number.isFinite)) return 0;
  return (a * l * c) / 1_000_000;
}

function pickUnitM3(prod: any, comp: any): number {
  const compM3 = toNum(comp?.volumeM3) || calcM3FromCm(comp?.alturaCm ?? null, comp?.larguraCm ?? null, comp?.comprimentoCm ?? null);
  if (compM3 > 0) return compM3;

  const prodM3 = toNum(prod?.volumeM3) || calcM3FromCm(prod?.alturaCm ?? null, prod?.larguraCm ?? null, prod?.comprimentoCm ?? null);
  if (prodM3 > 0) return prodM3;

  return 0;
}

/**
 * POST /api/planejamentos/validar
 * body:
 * {
 *   coletaIds: string[],
 *   veiculoId?: string | null,
 *   capacidadeKgOverride?: number,
 *   capacidadeM3Override?: number
 * }
 *
 * retorna:
 * {
 *   ok: true,
 *   totals: { pesoKg, volumeM3, coletas, itens },
 *   vehicle: { id, placa, capacidadeKg, capacidadeM3 } | null,
 *   fits: { kg: boolean, m3: boolean, ok: boolean },
 *   excess: { kg: number, m3: number }
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    const coletaIds = Array.isArray(body?.coletaIds)
      ? body.coletaIds.map((x: any) => String(x).trim()).filter(Boolean)
      : [];

    const veiculoId = body?.veiculoId ? String(body.veiculoId).trim() : null;

    if (!coletaIds.length) {
      return NextResponse.json({ ok: false, error: 'Informe coletaIds (array).' }, { status: 400 });
    }

    // busca veículo (se vier)
    const veiculo = veiculoId
      ? await prisma.veiculo.findUnique({
          where: { id: veiculoId },
          select: { id: true, placa: true, capacidadeKg: true, capacidadeM3: true },
        })
      : null;

    const capKg =
      body?.capacidadeKgOverride != null
        ? toNum(body.capacidadeKgOverride)
        : veiculo?.capacidadeKg != null
          ? toNum(veiculo.capacidadeKg)
          : 0;

    const capM3 =
      body?.capacidadeM3Override != null
        ? toNum(body.capacidadeM3Override)
        : veiculo?.capacidadeM3 != null
          ? toNum(veiculo.capacidadeM3)
          : 0;

    // 1) soma peso direto da coleta (se preenchido)
    const coletas = await prisma.coleta.findMany({
      where: { id: { in: coletaIds } },
      select: { id: true, nf: true, pesoTotalKg: true, valorFrete: true },
    });

    const pesoColetas = coletas.reduce((acc, c) => acc + toNum(c.pesoTotalKg), 0);

    // 2) soma volume via itens -> (componente do volume scaneado OU produto fallback)
    const itens = await prisma.itemColetado.findMany({
      where: { coletaId: { in: coletaIds } },
      select: {
        id: true,
        coletaId: true,
        quantidade: true,
        Produto: {
          select: {
            volumeM3: true,
            alturaCm: true,
            larguraCm: true,
            comprimentoCm: true,
          },
        },
        volumes: {
          // ItemVolume[]
          select: {
            id: true,
            componente: {
              select: {
                volumeM3: true,
                alturaCm: true,
                larguraCm: true,
                comprimentoCm: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    let volumeTotal = 0;
    for (const it of itens as any[]) {
      const qtd = Number(it.quantidade ?? 1);
      const quantidade = Number.isFinite(qtd) && qtd > 0 ? qtd : 1;

      const comp = it?.volumes?.[0]?.componente ?? null;
      const prod = it?.Produto ?? null;

      const unitM3 = pickUnitM3(prod, comp);
      volumeTotal += unitM3 * quantidade;
    }

    const totals = {
      pesoKg: pesoColetas,
      volumeM3: volumeTotal,
      coletas: coletas.length,
      itens: itens.length,
    };

    const fitsKg = capKg > 0 ? totals.pesoKg <= capKg : true; // se não tem capacidade definida, não bloqueia
    const fitsM3 = capM3 > 0 ? totals.volumeM3 <= capM3 : true;

    const excessKg = capKg > 0 ? Math.max(0, totals.pesoKg - capKg) : 0;
    const excessM3 = capM3 > 0 ? Math.max(0, totals.volumeM3 - capM3) : 0;

    return NextResponse.json({
      ok: true,
      totals,
      vehicle: veiculo
        ? {
            id: veiculo.id,
            placa: veiculo.placa,
            capacidadeKg: capKg,
            capacidadeM3: capM3,
          }
        : null,
      fits: { kg: fitsKg, m3: fitsM3, ok: fitsKg && fitsM3 },
      excess: { kg: excessKg, m3: excessM3 },
    });
  } catch (e: any) {
    console.error('POST /api/planejamentos/validar error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erro ao validar capacidades.' }, { status: 500 });
  }
}