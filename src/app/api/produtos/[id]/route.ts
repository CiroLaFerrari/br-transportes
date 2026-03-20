import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

// Next 15: params é Promise, então tipamos assim:
type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/produtos/[id]
 * Retorna o produto + componentes.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;

    const p = await prisma.produto.findUnique({
      where: { id },
      include: {
        componentes: {
          select: {
            id: true,
            createdAt: true,
            produtoId: true,
            nome: true,          // ✅ campo Prisma (mapeado para coluna "descricao")
            quantidade: true,
            pesoKg: true,
            alturaCm: true,
            larguraCm: true,
            comprimentoCm: true,
            areaM2: true,
            volumeM3: true,
            observacao: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!p) {
      return NextResponse.json(
        { error: 'Produto não encontrado.' },
        { status: 404 },
      );
    }

    return NextResponse.json(p);
  } catch (e: any) {
    console.error('GET /api/produtos/[id] error:', e);
    return NextResponse.json(
      { error: e?.message || 'Falha ao carregar produto.' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/produtos/[id]
 * Atualiza campos do produto. (Componentes são tratados em outra rota)
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;

    const body = await req.json().catch(() => ({}));

    const data: any = {};

    if (body.code !== undefined) {
      const code = String(body.code || '').trim();
      if (!code) {
        return NextResponse.json(
          { error: 'code não pode ser vazio.' },
          { status: 400 },
        );
      }
      data.code = code;
    }

    if (body.descricao !== undefined) {
      const descricao = String(body.descricao || '').trim();
      if (!descricao) {
        return NextResponse.json(
          { error: 'descricao não pode ser vazia.' },
          { status: 400 },
        );
      }
      data.descricao = descricao;
    }

    if (body.pesoKg !== undefined) {
      const n = toNumOrNull(body.pesoKg);
      if (n !== null && !Number.isFinite(n)) {
        return NextResponse.json(
          { error: 'pesoKg inválido.' },
          { status: 400 },
        );
      }
      data.pesoKg = n;
    }

    // Precisamos eventualmente recalcular areaM2/volumeM3 se altura/largura/comprimento mudarem
    let alturaCm: number | null | undefined;
    let larguraCm: number | null | undefined;
    let comprimentoCm: number | null | undefined;
    let precisaRecalcularAreaVolume = false;

    if (
      body.alturaCm !== undefined ||
      body.larguraCm !== undefined ||
      body.comprimentoCm !== undefined
    ) {
      const atual = await prisma.produto.findUnique({
        where: { id },
        select: {
          alturaCm: true,
          larguraCm: true,
          comprimentoCm: true,
        },
      });

      if (!atual) {
        return NextResponse.json(
          { error: 'Produto não encontrado.' },
          { status: 404 },
        );
      }

      alturaCm =
        body.alturaCm !== undefined
          ? toNumOrNull(body.alturaCm)
          : atual.alturaCm;
      larguraCm =
        body.larguraCm !== undefined
          ? toNumOrNull(body.larguraCm)
          : atual.larguraCm;
      comprimentoCm =
        body.comprimentoCm !== undefined
          ? toNumOrNull(body.comprimentoCm)
          : atual.comprimentoCm;

      if (
        (alturaCm !== null && !Number.isFinite(alturaCm)) ||
        (larguraCm !== null && !Number.isFinite(larguraCm)) ||
        (comprimentoCm !== null && !Number.isFinite(comprimentoCm))
      ) {
        return NextResponse.json(
          { error: 'alturaCm, larguraCm ou comprimentoCm inválidos.' },
          { status: 400 },
        );
      }

      data.alturaCm = alturaCm;
      data.larguraCm = larguraCm;
      data.comprimentoCm = comprimentoCm;
      precisaRecalcularAreaVolume = true;
    }

    if (body.embalado !== undefined) {
      data.embalado = Boolean(body.embalado);
    }

    if (body.tipoEmbalagem !== undefined) {
      const teRaw = body.tipoEmbalagem === null || body.tipoEmbalagem === '' ? null : String(body.tipoEmbalagem).trim().toUpperCase();
      data.tipoEmbalagem = teRaw && ['CAIXA_MADEIRA', 'CAIXA_PAPELAO', 'AMARRADO', 'OUTROS'].includes(teRaw) ? teRaw : null;
    }

    if (body.fragil !== undefined) {
      data.fragil = Boolean(body.fragil);
    }

    if (body.empilhavel !== undefined) {
      data.empilhavel = Boolean(body.empilhavel);
    }

    if (body.posicao !== undefined) {
      const posRaw = body.posicao === null || body.posicao === '' ? null : String(body.posicao).trim().toUpperCase();
      data.posicao = posRaw && ['FRONTAL', 'INDIFERENTE'].includes(posRaw) ? posRaw : null;
    }

    if (body.desmontavel !== undefined) {
      data.desmontavel = Boolean(body.desmontavel);
    }

    if (precisaRecalcularAreaVolume) {
      const { areaM2, volumeM3 } = calcAreaVolume(
        alturaCm ?? null,
        larguraCm ?? null,
        comprimentoCm ?? null,
      );
      data.areaM2 = areaM2;
      data.volumeM3 = volumeM3;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: 'Nenhum campo válido informado para atualização.' },
        { status: 400 },
      );
    }

    const updated = await prisma.produto.update({
      where: { id },
      data,
    });

    return NextResponse.json({ ok: true, updated });
  } catch (e: any) {
    console.error('PATCH /api/produtos/[id] error:', e);
    return NextResponse.json(
      { error: e?.message || 'Falha ao atualizar produto.' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/produtos/[id]
 * Remove o produto. Componentes são apagados em cascata (onDelete: Cascade).
 */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;

    await prisma.produto.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('DELETE /api/produtos/[id] error:', e);
    return NextResponse.json(
      { error: e?.message || 'Falha ao excluir produto.' },
      { status: 500 },
    );
  }
}

/* ----------------- Helpers ----------------- */

function toNumOrNull(v: any): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n =
    typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function calcAreaVolume(
  alturaCm: number | null,
  larguraCm: number | null,
  comprimentoCm: number | null,
) {
  if (
    alturaCm == null ||
    larguraCm == null ||
    comprimentoCm == null
  ) {
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
