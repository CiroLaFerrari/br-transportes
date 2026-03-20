'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

type Props = {
  planejamentoId: string;
  coletaIds: string[]; // IDs selecionados no UI
};

export default function PlanejamentoAcoes({ planejamentoId, coletaIds }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const disabledReason = useMemo(() => {
    if (!planejamentoId?.trim()) return 'planejamentoId inválido';
    if (!Array.isArray(coletaIds) || coletaIds.length === 0) return 'Selecione pelo menos 1 coleta';
    return null;
  }, [planejamentoId, coletaIds]);

  async function gerarRotaEmUmClique() {
    if (disabledReason) {
      setMsg(disabledReason);
      return;
    }

    setLoading(true);
    setMsg(null);

    try {
      // 1) vincula paradas ao planejamento (cria Parada com planejamentoId)
      const res1 = await fetch(`/api/planejamentos/${planejamentoId}/vincular-paradas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          coletaIds,
          resetOrdem: true,
        }),
      });

      const j1 = await res1.json().catch(() => null);
      if (!res1.ok) {
        throw new Error(j1?.error || 'Falha ao vincular paradas ao planejamento.');
      }

      // 2) gera rota e atribui rotaId nas paradas (e reseta status se quiser)
      const res2 = await fetch('/api/rotas/gerar-de-planejamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          planejamentoId,
          resetStatusParadas: true,
        }),
      });

      const j2 = await res2.json().catch(() => null);
      if (!res2.ok) {
        throw new Error(j2?.error || 'Falha ao gerar rota do planejamento.');
      }

      const rotaId = j2?.rota?.id || j2?.rotaId;
      if (!rotaId) {
        throw new Error('Rota gerada, mas não consegui pegar o rotaId na resposta.');
      }

      setMsg('Rota gerada com sucesso. Abrindo…');
      router.push(`/rotas/${rotaId}`);
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message || 'Erro inesperado ao gerar rota.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={gerarRotaEmUmClique}
        disabled={loading || !!disabledReason}
        style={{
          padding: '8px 12px',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          background: loading || disabledReason ? '#334155' : '#16a34a',
          color: 'white',
          cursor: loading || disabledReason ? 'not-allowed' : 'pointer',
        }}
        title={disabledReason || 'Vincula paradas + gera rota + abre a rota'}
      >
        {loading ? 'Gerando…' : 'Gerar rota (1 clique)'}
      </button>

      <span style={{ color: msg?.includes('sucesso') ? '#9bdc9b' : '#f59e0b', fontSize: 13 }}>
        {msg}
      </span>
    </div>
  );
}
