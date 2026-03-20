// src/app/coletas/[id]/etiquetas/page.tsx
import { prisma } from '@/lib/prisma';
import EtiquetasColetaClient from './EtiquetasColetaClient';

type PageParams = {
  // 👇 No Next 15, params vem como Promise
  params: Promise<{ id: string }>;
};

export default async function ColetaEtiquetasPage({ params }: PageParams) {
  // 👇 precisa dar await em params
  const { id } = await params;

  if (!id) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 p-6">
        <h1 className="text-xl font-semibold mb-4">Etiquetas da coleta</h1>
        <div className="rounded border border-red-500/50 bg-red-900/30 px-4 py-3 text-sm text-red-100">
          Parâmetro <code>id</code> da coleta é obrigatório.
        </div>
      </div>
    );
  }

  const coleta = await prisma.coleta.findUnique({
    where: { id },
    include: {
      Cliente: true,
      itens: {
        include: {
          Produto: true,
        },
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!coleta) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 p-6">
        <h1 className="text-xl font-semibold mb-4">Etiquetas da coleta</h1>
        <div className="rounded border border-red-500/50 bg-red-900/30 px-4 py-3 text-sm text-red-100">
          Coleta não encontrada.
        </div>
      </div>
    );
  }

  // Expande cada ItemColetado em "volumes" (uma etiqueta por volume)
  const etiquetas = coleta.itens.flatMap((item) => {
    const total = item.quantidade || 1;
    const descricaoProduto = item.Produto?.descricao ?? '';
    const arr: {
      id: string;
      codigo: string;
      volumeNumero: number;
      volumeTotal: number;
      produtoDescricao: string;
    }[] = [];

    for (let n = 1; n <= total; n += 1) {
      arr.push({
        id: `${item.id}-${n}`,
        codigo: item.etiqueta,
        volumeNumero: n,
        volumeTotal: total,
        produtoDescricao: descricaoProduto,
      });
    }

    return arr;
  });

  const data = {
    coletaId: coleta.id,
    nf: coleta.nf,
    cliente: coleta.Cliente?.razao ?? '',
    cidade: coleta.cidade,
    uf: coleta.uf,
    pesoTotalKg: coleta.pesoTotalKg ?? null,
    etiquetas,
  };

  return <EtiquetasColetaClient data={data} />;
}
