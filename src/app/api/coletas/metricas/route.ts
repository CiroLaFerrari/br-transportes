// src/app/api/coletas/metricas/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function toNumOrNull(v: any): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : null;
}

// cm -> m³
function calcM3FromCm(alt: number | null, larg: number | null, comp: number | null): number | null {
  if (alt == null || larg == null || comp == null) return null;
  const a = Number(alt);
  const l = Number(larg);
  const c = Number(comp);
  if (![a, l, c].every(Number.isFinite)) return null;
  return (a * l * c) / 1_000_000; // cm³ -> m³
}

function pickFirstFinite(...vals: Array<number | null | undefined>) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function pickM3FromProduto(prod: any): number {
  if (!prod) return 0;

  const direct = toNumOrNull(prod.volumeM3);
  if (direct != null && direct > 0) return direct;

  const alt = toNumOrNull(prod.alturaCm);
  const larg = toNumOrNull(prod.larguraCm);
  const comp = toNumOrNull(prod.comprimentoCm);

  const calc = calcM3FromCm(alt, larg, comp);
  return calc != null && calc > 0 ? calc : 0;
}

function pickM3FromComponente(comp: any): number {
  if (!comp) return 0;

  const direct = toNumOrNull(comp.volumeM3);
  if (direct != null && direct > 0) return direct;

  const alt = toNumOrNull(comp.alturaCm);
  const larg = toNumOrNull(comp.larguraCm);
  const compr = toNumOrNull(comp.comprimentoCm);

  const calc = calcM3FromCm(alt, larg, compr);
  return calc != null && calc > 0 ? calc : 0;
}

/**
 * POST /api/coletas/metricas
 * body: { ids: string[] }
 * retorna: { ok: true, data: [{ coletaId, volumeTotalM3 }] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const ids = Array.isArray(body?.ids) ? body.ids.map((x: any) => String(x).trim()).filter(Boolean) : [];

    if (!ids.length) return NextResponse.json({ ok: true, data: [] });

    const itens = await prisma.itemColetado.findMany({
      where: { coletaId: { in: ids } },
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
        },
      },
    });

    const byColeta: Record<string, number> = {};

    for (const it of itens as any[]) {
      const coletaId = String(it?.coletaId || '').trim();
      if (!coletaId) continue;

      const prod = it?.Produto || null;

      const vols: Array<any> = Array.isArray(it?.volumes) ? it.volumes : [];

      // ✅ Caminho ideal: existe ItemVolume (etiquetas)
      if (vols.length > 0) {
        for (const v of vols) {
          const comp = v?.componente || null;

          const compM3 = pickM3FromComponente(comp);
          const prodM3 = pickM3FromProduto(prod);

          // 1 volume = 1 unidade física (etiqueta)
          const unitM3 = pickFirstFinite(compM3, prodM3);
          byColeta[coletaId] = (byColeta[coletaId] || 0) + unitM3;
        }
        continue;
      }

      // ✅ Fallback: sem volumes (ainda não “embalado/etiquetado”)
      const qtd = Number(it?.quantidade ?? 1);
      const quantidade = Number.isFinite(qtd) && qtd > 0 ? qtd : 1;

      const prodM3 = pickM3FromProduto(prod);
      const totalItemM3 = prodM3 * quantidade;

      byColeta[coletaId] = (byColeta[coletaId] || 0) + totalItemM3;
    }

    const out = ids.map((coletaId: string) => ({
      coletaId,
      volumeTotalM3: Number(byColeta[coletaId] || 0),
    }));

    return NextResponse.json({ ok: true, data: out });
  } catch (e: any) {
    console.error('POST /api/coletas/metricas error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Falha ao calcular métricas' }, { status: 500 });
  }
}