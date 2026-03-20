'use client';

import { useState } from 'react';

type ResumoItem = {
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
  itens: ResumoItem[];
  totais: {
    pesoTotalKg: number;
    volumeTotalM3: number;
  };
};

type ItemReq = {
  produtoId: string;
  quantidade: number;
};

export function useResumoCargaProdutos() {
  const [resumo, setResumo] = useState<ResumoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function calcular(items: ItemReq[]) {
    try {
      setLoading(true);
      setErro(null);
      setResumo(null);

      if (!items.length) {
        throw new Error('Nenhum item informado.');
      }

      const res = await fetch('/api/produtos/resumo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      const j = await res.json();

      if (!res.ok) {
        throw new Error(j?.error || 'Falha ao calcular resumo da carga');
      }

      setResumo(j as ResumoResponse);
    } catch (e: any) {
      setErro(e?.message || 'Falha ao calcular resumo da carga');
    } finally {
      setLoading(false);
    }
  }

  return { resumo, loading, erro, calcular };
}
