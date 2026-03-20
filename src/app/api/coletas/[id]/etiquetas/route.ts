import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  // Next 15: params é uma Promise
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const coletaId = id;

    if (!coletaId) {
      return NextResponse.json(
        { ok: false, error: 'Parâmetro id da coleta é obrigatório.' },
        { status: 400 },
      );
    }

    const coleta = await prisma.coleta.findUnique({
      where: { id: coletaId },
      include: {
        Cliente: true,
        itens: {
          include: {
            Produto: true,
          },
        },
      },
    });

    if (!coleta) {
      // ❌ Não lança erro, só retorna uma resposta limpa
      return NextResponse.json(
        { ok: false, error: 'Coleta não encontrada.' },
        { status: 404 },
      );
    }

    const nf = coleta.nf;
    const clienteNome = coleta.Cliente?.razao ?? 'Cliente não informado';
    const cidade = coleta.cidade || coleta.Cliente?.cidade || 'Cidade';
    const uf = coleta.uf || coleta.Cliente?.uf || 'UF';
    const dataColetaIso = coleta.createdAt.toISOString();

    const itensOrdenados = [...coleta.itens].sort((a, b) =>
      (a.etiqueta ?? '').localeCompare(b.etiqueta ?? ''),
    );
    const totalVolumes = itensOrdenados.length;

    const etiquetas = itensOrdenados.map((item, idx) => {
      const produto = item.Produto;
      const volumeNumero = idx + 1;

      let pesoKg: number | null = null;
      if (produto?.pesoKg != null) {
        pesoKg = produto.pesoKg * item.quantidade;
      } else if (coleta.pesoTotalKg != null && totalVolumes > 0) {
        pesoKg = coleta.pesoTotalKg / totalVolumes;
      }

      return {
        id: item.id,
        codigoEtiqueta: item.etiqueta, // código real da etiqueta
        nf,
        cliente: clienteNome,
        cidade,
        uf,
        itemCodigo: produto?.code ?? 'SEM_CODIGO',
        itemDescricao: produto?.descricao ?? 'Produto sem descrição',
        volume: volumeNumero,
        totalVolumes,
        pesoKg,
        coletaId: coleta.id,
        dataColeta: dataColetaIso,
      };
    });

    return NextResponse.json({ ok: true, etiquetas });
  } catch (err: any) {
    console.error('GET /api/coletas/[id]/etiquetas error:', err);
    return NextResponse.json(
      { ok: false, error: 'Erro interno ao gerar etiquetas da coleta.' },
      { status: 500 },
    );
  }
}
