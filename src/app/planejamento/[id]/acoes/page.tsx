// src/app/planejamentos/[id]/acoes/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

type Coleta = {
  id: string;
  nf: string;
  cidade: string;
  uf: string;
  createdAt?: string;
  Cliente?: { id: string; razao: string | null };
};

export default function PlanejamentoAcoesPage() {
  const { id } = useParams<{ id: string }>();
  const planejamentoId = id;

  const [coletas, setColetas] = useState<Coleta[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function loadColetas() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/coletas/sem-rota?limit=200', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Falha ao carregar coletas');
      setColetas(Array.isArray(json?.list) ? json.list : []);
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao carregar coletas');
      setColetas([]);
    } finally {
      setLoading(false);
    }
  }

  // ✅ PADRONIZADO com /planejamentos/page.tsx
  // POST /api/planejamentos/[id]/vincular-coletas
  async function vincularColetasNoPlanejamento() {
    const ids = Object.entries(selected)
      .filter(([_, v]) => v)
      .map(([k]) => k);

    if (ids.length === 0) return setMsg('Selecione pelo menos 1 coleta.');

    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/planejamentos/${planejamentoId}/vincular-coletas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coletaIds: ids }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Falha ao vincular coletas');

      setMsg(`OK: vinculadas ${json?.vinculadas ?? ids.length} coleta(s) ao planejamento.`);
      await loadColetas();
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao vincular');
    } finally {
      setLoading(false);
    }
  }

  // ✅ PADRONIZADO com /planejamentos/page.tsx
  // POST /api/planejamentos/[id]/gerar-rota  -> retorna rota.id e redireciona para /scan
  async function gerarRotaEAbrirScan() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/planejamentos/${planejamentoId}/gerar-rota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetStatusParadas: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Falha ao gerar rota');

      const rotaId = json?.rota?.id;
      if (!rotaId) throw new Error('API gerou a rota, mas não retornou rota.id');

      setMsg(`OK: rota gerada (${rotaId}). Abrindo Scan…`);
      window.location.href = `/scan?rotaId=${encodeURIComponent(String(rotaId))}`;
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao gerar rota');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadColetas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleAll = (val: boolean) => {
    const next: Record<string, boolean> = {};
    for (const c of coletas) next[c.id] = val;
    setSelected(next);
  };

  return (
    <div style={{ maxWidth: 1100, margin: '20px auto', padding: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <h1 style={{ fontSize: 22 }}>Planejamento — Ações</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            href="/planejamentos"
            style={{
              padding: '8px 10px',
              background: '#1A4A1A',
              color: '#fff',
              borderRadius: 8,
              textDecoration: 'none',
            }}
          >
            Voltar
          </Link>
          <Link
            href="/scan"
            style={{
              padding: '8px 10px',
              background: '#0ea5e9',
              color: '#0b1020',
              borderRadius: 8,
              textDecoration: 'none',
            }}
          >
            Ir para Scan
          </Link>
        </div>
      </div>

      <div
        style={{
          background: '#0f1720',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          padding: 12,
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => void loadColetas()}
          disabled={loading}
          style={{
            padding: '8px 12px',
            background: '#1A4A1A',
            color: 'white',
            border: 0,
            borderRadius: 8,
          }}
        >
          {loading ? 'Carregando…' : 'Recarregar coletas'}
        </button>

        <button
          onClick={() => void vincularColetasNoPlanejamento()}
          disabled={loading}
          style={{
            padding: '8px 12px',
            background: '#2563eb',
            color: 'white',
            border: 0,
            borderRadius: 8,
          }}
          title="Vincula as coletas selecionadas no planejamento (cria/atualiza paradas)"
        >
          Vincular coletas no planejamento
        </button>

        <button
          onClick={() => void gerarRotaEAbrirScan()}
          disabled={loading}
          style={{
            padding: '8px 12px',
            background: '#22c55e',
            color: '#0b1020',
            border: 0,
            borderRadius: 8,
            fontWeight: 700,
          }}
          title="Gera a rota (resetando status das paradas) e abre o /scan já com rotaId"
        >
          1 clique: gerar rota + abrir Scan
        </button>

        {msg && (
          <span
            style={{
              alignSelf: 'center',
              color: msg.startsWith('OK') ? '#9bdc9b' : '#f59e0b',
              fontWeight: 700,
            }}
          >
            {msg}
          </span>
        )}
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button
          onClick={() => toggleAll(true)}
          disabled={loading}
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: '#0f1720',
            color: '#e5e7eb',
          }}
        >
          Selecionar tudo
        </button>
        <button
          onClick={() => toggleAll(false)}
          disabled={loading}
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: '#0f1720',
            color: '#e5e7eb',
          }}
        >
          Limpar seleção
        </button>
      </div>

      <div style={{ marginTop: 10, border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#0f1720', color: '#9db0ca' }}>
              <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0', width: 60 }}>Sel</th>
              <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>NF</th>
              <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Cidade</th>
              <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>UF</th>
              <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Cliente</th>
              <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>coletaId</th>
            </tr>
          </thead>
          <tbody>
            {coletas.map((c) => (
              <tr key={c.id} style={{ background: '#ffffff', color: '#1e293b' }}>
                <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>
                  <input
                    type="checkbox"
                    checked={!!selected[c.id]}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                  />
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{c.nf}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{c.cidade}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{c.uf}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{c.Cliente?.razao ?? '-'}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0', fontFamily: 'ui-monospace, monospace' }}>
                  {c.id}
                </td>
              </tr>
            ))}

            {coletas.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 16, color: '#9db0ca', textAlign: 'center' }}>
                  Nenhuma coleta “sem rota” encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, color: '#9db0ca', fontSize: 13 }}>
        PlanejamentoId: <span style={{ fontFamily: 'ui-monospace, monospace' }}>{planejamentoId}</span>
      </div>
    </div>
  );
}
