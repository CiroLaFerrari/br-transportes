import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function toNumOrNull(v: any): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function calcAreaVolume(
  alturaCm: number | null,
  larguraCm: number | null,
  comprimentoCm: number | null,
) {
  if (alturaCm == null || larguraCm == null || comprimentoCm == null) {
    return { areaM2: null as number | null, volumeM3: null as number | null };
  }

  const a = Number(alturaCm);
  const l = Number(larguraCm);
  const c = Number(comprimentoCm);

  if (![a, l, c].every(Number.isFinite)) {
    return { areaM2: null, volumeM3: null };
  }

  const areaM2 = (l * c) / 10000; // cm² -> m²
  const volumeM3 = (a * l * c) / 1_000_000; // cm³ -> m³
  return { areaM2, volumeM3 };
}

/**
 * GET /api/componentes/[id]
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;

    const c = await prisma.componente.findUnique({ where: { id } });
    if (!c) {
      return NextResponse.json({ error: 'Componente não encontrado.' }, { status: 404 });
    }

    return NextResponse.json(c);
  } catch (e: any) {
    console.error('GET /api/componentes/[id] error:', e);
    return NextResponse.json({ error: e?.message || 'Falha ao carregar componente.' }, { status: 500 });
  }
}

/**
 * PATCH /api/componentes/[id]
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const data: any = {};

    if (body.nome !== undefined) {
      const nome = String(body.nome || '').trim();
      if (!nome) return NextResponse.json({ error: 'nome não pode ser vazio.' }, { status: 400 });
      data.nome = nome;
    }

    if (body.quantidade !== undefined) {
      const q = Number(body.quantidade);
      if (!Number.isFinite(q) || q < 1) {
        return NextResponse.json({ error: 'quantidade inválida.' }, { status: 400 });
      }
      data.quantidade = q;
    }

    if (body.pesoKg !== undefined) data.pesoKg = toNumOrNull(body.pesoKg);

    // Recalcula área/volume se dimensões mudarem
    let precisaRecalcular = false;
    let alturaCm: number | null | undefined;
    let larguraCm: number | null | undefined;
    let comprimentoCm: number | null | undefined;

    if (body.alturaCm !== undefined || body.larguraCm !== undefined || body.comprimentoCm !== undefined) {
      const atual = await prisma.componente.findUnique({
        where: { id },
        select: { alturaCm: true, larguraCm: true, comprimentoCm: true },
      });

      if (!atual) return NextResponse.json({ error: 'Componente não encontrado.' }, { status: 404 });

      alturaCm = body.alturaCm !== undefined ? toNumOrNull(body.alturaCm) : atual.alturaCm;
      larguraCm = body.larguraCm !== undefined ? toNumOrNull(body.larguraCm) : atual.larguraCm;
      comprimentoCm = body.comprimentoCm !== undefined ? toNumOrNull(body.comprimentoCm) : atual.comprimentoCm;

      data.alturaCm = alturaCm;
      data.larguraCm = larguraCm;
      data.comprimentoCm = comprimentoCm;

      precisaRecalcular = true;
    }

    if (body.observacao !== undefined) {
      data.observacao = body.observacao === null || body.observacao === '' ? null : String(body.observacao);
    }

    if (precisaRecalcular) {
      const { areaM2, volumeM3 } = calcAreaVolume(
        alturaCm ?? null,
        larguraCm ?? null,
        comprimentoCm ?? null,
      );
      data.areaM2 = areaM2;
      data.volumeM3 = volumeM3;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo válido informado para atualização.' }, { status: 400 });
    }

    const updated = await prisma.componente.update({ where: { id }, data });
    return NextResponse.json({ ok: true, updated });
  } catch (e: any) {
    console.error('PATCH /api/componentes/[id] error:', e);
    return NextResponse.json({ error: e?.message || 'Falha ao atualizar componente.' }, { status: 500 });
  }
}

/**
 * DELETE /api/componentes/[id]
 */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;

    await prisma.componente.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('DELETE /api/componentes/[id] error:', e);
    return NextResponse.json({ error: e?.message || 'Falha ao excluir componente.' }, { status: 500 });
  }
}
