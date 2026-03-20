import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

type ResumoItemRequest = {
  produtoId: string;
  quantidade?: number;
};

type ResumoItemResponse = {
  produtoId: string;
  code: string;
  descricao: string;
  quantidade: number;
  pesoProdutoKg: number;
  volumeProdutoM3: number;
  pesoComponentesKg: number;
  volumeComponentesM3: number;
  pesoTotalItemKg: number;
  volumeTotalItemM3: number;
};

type ResumoResponse = {
  itens: ResumoItemResponse[];
  totais: {
    pesoTotalKg: number;
    volumeTotalM3: number;
  };
};

/**
 * POST /api/produtos/resumo
 *
 * Body:
 * {
 *   items: [
 *     { produtoId: "uuid", quantidade: 2 },
 *     ...
 *   ]
 * }
 *
 * Retorna totais de peso/volume por produto e globais.
 */
export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type deve ser application/json' },
        { status: 415 },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const items: ResumoItemRequest[] = Array.isArray(body.items)
      ? body.items
      : [];

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'Informe pelo menos um item em "items".' },
        { status: 400 },
      );
    }

    const ids = Array.from(
      new Set(
        items
          .map((it) => String(it.produtoId || '').trim())
          .filter((id) => !!id),
      ),
    );

    if (ids.length === 0) {
      return NextResponse.json(
        { error: 'produtoId inválido em todos os items.' },
        { status: 400 },
      );
    }

    const produtos = await prisma.produto.findMany({
      where: { id: { in: ids } },
      include: {
        componentes: true,
      },
    });

    const produtoMap = new Map(
      produtos.map((p) => [p.id, p]),
    );

    const respostaItens: ResumoItemResponse[] = [];

    let pesoTotalKg = 0;
    let volumeTotalM3 = 0;

    for (const item of items) {
      const produtoId = String(item.produtoId || '').trim();
      const quantidade = Number.isFinite(Number(item.quantidade))
        ? Number(item.quantidade)
        : 1;

      const p = produtoMap.get(produtoId);
      if (!p) {
        // Ignora produtos inexistentes, mas poderia também lançar erro
        continue;
      }

      // Produto
      const pesoProdutoKg = toNumberOrZero(p.pesoKg);
      const volumeProdutoM3 =
        p.volumeM3 != null
          ? toNumberOrZero(p.volumeM3)
          : calcVolumeFromDimensions(p.alturaCm, p.larguraCm, p.comprimentoCm);

      // Componentes
      let pesoComponentesKg = 0;
      let volumeComponentesM3 = 0;

      for (const c of p.componentes) {
        const qtdComp =
          typeof (c as any).quantidade === 'number' &&
          Number.isFinite((c as any).quantidade)
            ? (c as any).quantidade
            : 1;

        const pesoC = toNumberOrZero(c.pesoKg) * qtdComp;

        const volumeC =
          c.volumeM3 != null
            ? toNumberOrZero(c.volumeM3) * qtdComp
            : calcVolumeFromDimensions(
                c.alturaCm,
                c.larguraCm,
                c.comprimentoCm,
              ) * qtdComp;

        pesoComponentesKg += pesoC;
        volumeComponentesM3 += volumeC;
      }

      const pesoUnitarioKg = pesoProdutoKg + pesoComponentesKg;
      const volumeUnitarioM3 = volumeProdutoM3 + volumeComponentesM3;

      const pesoTotalItemKg = pesoUnitarioKg * quantidade;
      const volumeTotalItemM3 = volumeUnitarioM3 * quantidade;

      pesoTotalKg += pesoTotalItemKg;
      volumeTotalM3 += volumeTotalItemM3;

      respostaItens.push({
        produtoId,
        code: p.code,
        descricao: p.descricao,
        quantidade,
        pesoProdutoKg,
        volumeProdutoM3,
        pesoComponentesKg,
        volumeComponentesM3,
        pesoTotalItemKg,
        volumeTotalItemM3,
      });
    }

    const resposta: ResumoResponse = {
      itens: respostaItens,
      totais: {
        pesoTotalKg,
        volumeTotalM3,
      },
    };

    return NextResponse.json(resposta);
  } catch (e: any) {
    console.error('POST /api/produtos/resumo error:', e);
    return NextResponse.json(
      { error: e?.message || 'Falha ao calcular resumo de produtos.' },
      { status: 500 },
    );
  }
}

/* ----------------- Helpers ----------------- */

function toNumberOrZero(v: any): number {
  if (v === null || v === undefined) return 0;
  const n =
    typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function calcVolumeFromDimensions(
  alturaCm?: number | null,
  larguraCm?: number | null,
  comprimentoCm?: number | null,
): number {
  if (
    alturaCm == null ||
    larguraCm == null ||
    comprimentoCm == null
  ) {
    return 0;
  }

  const a = Number(alturaCm);
  const l = Number(larguraCm);
  const c = Number(comprimentoCm);

  if (![a, l, c].every(Number.isFinite)) {
    return 0;
  }

  // cm³ -> m³
  return (a * l * c) / 1_000_000;
}
