import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type ReqProduto = {
  code: string;
  quantidade: number;
};

type CargaItemResumo = {
  code: string;
  descricao: string;
  quantidade: number;
  unitPesoKg: number;
  unitAreaM2: number;
  unitVolumeM3: number;
  totalPesoKg: number;
  totalAreaM2: number;
  totalVolumeM3: number;
};

type CargaResumo = {
  ok: boolean;
  planejamentoId: string;
  totalPesoKg: number;
  totalAreaM2: number;
  totalVolumeM3: number;
  itens: CargaItemResumo[];
};

// Next 15: ctx.params é uma Promise
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    // garante que o planejamento existe (apenas validação simples)
    const plan = await prisma.planejamento.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!plan) {
      return NextResponse.json({ error: 'Planejamento não encontrado.' }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.produtos)) {
      return NextResponse.json(
        { error: 'Envie um JSON no formato { produtos: [{ code, quantidade }] }.' },
        { status: 400 },
      );
    }

    const raw: ReqProduto[] = body.produtos.map((r: any) => ({
      code: String(r.code || '').trim(),
      quantidade: Number(r.quantidade ?? 0),
    }));

    const itensValidos = raw.filter(r => r.code && Number.isFinite(r.quantidade) && r.quantidade > 0);

    if (itensValidos.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum produto / quantidade válido informado.' },
        { status: 400 },
      );
    }

    const codes = Array.from(new Set(itensValidos.map(i => i.code)));

    const produtos = await prisma.produto.findMany({
      where: { code: { in: codes } },
      select: {
        id: true,
        code: true,
        descricao: true,
        pesoKg: true,
        alturaCm: true,
        larguraCm: true,
        comprimentoCm: true,
        areaM2: true,
        volumeM3: true,
      },
    });

    const notFound = codes.filter(c => !produtos.some(p => p.code === c));
    if (notFound.length > 0) {
      return NextResponse.json(
        { error: `Produto(s) não encontrado(s): ${notFound.join(', ')}` },
        { status: 400 },
      );
    }

    let totalPesoKg = 0;
    let totalAreaM2 = 0;
    let totalVolumeM3 = 0;

    const itensResumo: CargaItemResumo[] = itensValidos.map(item => {
      const p = produtos.find(pp => pp.code === item.code)!;

      const unitPeso = p.pesoKg ?? 0;

      const unitArea =
        typeof p.areaM2 === 'number'
          ? p.areaM2
          : p.larguraCm && p.comprimentoCm
            ? (p.larguraCm / 100) * (p.comprimentoCm / 100)
            : 0;

      const unitVolume =
        typeof p.volumeM3 === 'number'
          ? p.volumeM3
          : p.alturaCm && p.larguraCm && p.comprimentoCm
            ? (p.alturaCm / 100) * (p.larguraCm / 100) * (p.comprimentoCm / 100)
            : 0;

      const qtd = item.quantidade;

      const totalPeso = unitPeso * qtd;
      const totalArea = unitArea * qtd;
      const totalVolume = unitVolume * qtd;

      totalPesoKg += totalPeso;
      totalAreaM2 += totalArea;
      totalVolumeM3 += totalVolume;

      return {
        code: p.code,
        descricao: p.descricao,
        quantidade: qtd,
        unitPesoKg: unitPeso,
        unitAreaM2: unitArea,
        unitVolumeM3: unitVolume,
        totalPesoKg: totalPeso,
        totalAreaM2: totalArea,
        totalVolumeM3: totalVolume,
      };
    });

    const resposta: CargaResumo = {
      ok: true,
      planejamentoId: id,
      totalPesoKg,
      totalAreaM2,
      totalVolumeM3,
      itens: itensResumo,
    };

    return NextResponse.json(resposta);
  } catch (e: any) {
    console.error('Erro em POST /api/planejamentos/[id]/carga', e);
    return NextResponse.json(
      { error: 'Erro interno ao calcular carga.' },
      { status: 500 },
    );
  }
}
