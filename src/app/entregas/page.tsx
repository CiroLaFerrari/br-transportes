'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type ColetaStatus = 'EM_PATIO' | 'CARREGADA' | 'EM_TRANSITO' | 'ENTREGUE';

type ColetaRow = {
  id: string;
  nf: string;
  cidade: string;
  uf: string;
  status: ColetaStatus;
  entradaPatioAt: string | null;
  embarqueAt: string | null;
  fimPatioAt: string | null;
  entregueAt: string | null; // se não existir no schema, o backend deve omitir; aqui não quebra
  pesoTotalKg: number | null;
  valorFrete: number | null;
  Cliente: { razao: string } | null;
};

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return String(iso);
  }
}

function diffDays(fromIso?: string | null, toIso?: string | null) {
  if (!fromIso) return null;
  const a = new Date(fromIso).getTime();
  const b = toIso ? new Date(toIso).getTime() : Date.now();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const d = (b - a) / (1000 * 60 * 60 * 24);
  return d >= 0 ? d : null;
}

export default function EntregasPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ColetaStatus>('EM_PATIO');

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [list, setList] = useState<ColetaRow[]>([]);
  const [acaoMsg, setAcaoMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    setAcaoMsg(null);

    try {
      const qs = new URLSearchParams();
      qs.set('limit', '200');
      qs.set('status', status);
      if (q.trim()) qs.set('q', q.trim());

      const res = await fetch('/api/coletas?' + qs.toString(), { cache: 'no-store' });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'Falha ao carregar coletas');

      setList(Array.isArray(j) ? j : (j?.data ?? []));
    } catch (e: any) {
      setErr(e?.message || 'Falha ao carregar');
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resumo = useMemo(() => {
    const total = list.length;
    const aberto = list.filter((c) => !c.fimPatioAt).length;
    const mediaDias = (() => {
      const vals = list
        .map((c) => diffDays(c.entradaPatioAt, c.fimPatioAt))
        .filter((n): n is number => typeof n === 'number');
      if (!vals.length) return null;
      const s = vals.reduce((a, b) => a + b, 0);
      return s / vals.length;
    })();
    return { total, aberto, mediaDias };
  }, [list]);

  async function acao(
    coletaId: string,
    action: 'SAIDA_PATIO' | 'EM_TRANSITO' | 'ENTREGUE',
    note?: string,
  ) {
    const ok = confirm(
      action === 'SAIDA_PATIO'
        ? 'Declarar saída do pátio? (não deve duplicar)'
        : action === 'EM_TRANSITO'
          ? 'Marcar como EM_TRANSITO?'
          : 'Marcar como ENTREGUE?',
    );
    if (!ok) return;

    try {
      setBusyId(coletaId);
      setAcaoMsg(null);
      setErr(null);

      const res = await fetch(`/api/coletas/${encodeURIComponent(coletaId)}/acao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || j?.ok === false) throw new Error(j?.error || 'Falha na ação');

      setAcaoMsg(`OK: ${action} confirmado em ${coletaId}.`);
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Falha na ação');
    } finally {
      setBusyId(null);
    }
  }

  const page: React.CSSProperties = {
    padding: 16,
    minHeight: '100vh',
    color: '#1e293b',
  };

  const card: React.CSSProperties = {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    background: '#ffffff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  };

  const input: React.CSSProperties = {
    padding: 10,
    borderRadius: 10,
    border: '1px solid #d1d5db',
    background: '#ffffff',
    color: '#1e293b',
    width: 320,
  };

  const select: React.CSSProperties = {
    padding: 10,
    borderRadius: 10,
    border: '1px solid #d1d5db',
    background: '#ffffff',
    color: '#1e293b',
    width: 170,
    fontWeight: 900,
  };

  const btn: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 900,
  };

  const btnMini: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid #d1d5db',
    background: '#f1f5f9',
    color: '#1e293b',
    cursor: 'pointer',
    fontWeight: 900,
    fontSize: 12,
  };

  return (
    <div style={page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, color: '#1A4A1A' }}>Entregas</h1>
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
            Status da <b>COLETA</b> (pátio / trânsito / entregue)
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link
            href="/planejamento"
            style={{
              ...btn,
              background: '#38bdf8',
              color: '#fff',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Ir para Planejamentos
          </Link>

          <Link
            href="/rotas"
            style={{
              ...btn,
              background: '#22c55e',
              color: '#fff',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Ir para Rotas
          </Link>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={status} onChange={(e) => setStatus(e.target.value as any)} style={select as any}>
            <option value="EM_PATIO">EM_PATIO</option>
            <option value="CARREGADA">CARREGADA</option>
            <option value="EM_TRANSITO">EM_TRANSITO</option>
            <option value="ENTREGUE">ENTREGUE</option>
          </select>

          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por NF, cidade, cliente" style={input} />

          <button
            onClick={() => void load()}
            disabled={loading}
            style={{
              ...btn,
              background: loading ? '#d1d5db' : '#1A4A1A',
              color: '#fff',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Carregando…' : 'Recarregar'}
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, opacity: 0.85 }}>
              Total: <b>{resumo.total}</b>
            </span>
            <span style={{ fontSize: 12, opacity: 0.85 }}>
              Pátio aberto: <b>{resumo.aberto}</b>
            </span>
            <span style={{ fontSize: 12, opacity: 0.85 }}>
              Média (dias): <b>{resumo.mediaDias == null ? '—' : resumo.mediaDias.toFixed(2)}</b>
            </span>
          </div>
        </div>

        {err && <div style={{ marginTop: 10, color: '#dc2626', fontWeight: 900 }}>{err}</div>}
        {acaoMsg && <div style={{ marginTop: 10, color: '#16a34a', fontWeight: 900 }}>{acaoMsg}</div>}
      </div>

      <div style={{ ...card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>NF</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Cliente</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Cidade/UF</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Status</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Entrada pátio</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Saída pátio</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Lead (dias)</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => {
              const lead = diffDays(c.entradaPatioAt, c.fimPatioAt);
              const aberto = !c.fimPatioAt;
              const busy = busyId === c.id;

              const saidaJaDeclarada = !!c.fimPatioAt;

              return (
                <tr key={c.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: 10, fontWeight: 900 }}>{c.nf}</td>
                  <td style={{ padding: 10 }}>{c.Cliente?.razao ?? '—'}</td>
                  <td style={{ padding: 10 }}>
                    {c.cidade} / {c.uf}
                  </td>
                  <td style={{ padding: 10, fontWeight: 900 }}>
                    <code>{c.status}</code>
                  </td>
                  <td style={{ padding: 10, fontWeight: 800 }}>{fmtDate(c.entradaPatioAt)}</td>
                  <td style={{ padding: 10, fontWeight: 800 }}>{fmtDate(c.fimPatioAt)}</td>
                  <td style={{ padding: 10, fontWeight: 900 }}>
                    {lead == null ? '—' : `${lead.toFixed(2)}${aberto ? ' (aberto)' : ''}`}
                  </td>
                  <td style={{ padding: 10 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        style={{
                          ...btnMini,
                          background: busy || saidaJaDeclarada ? '#f1f5f9' : '#22c55e',
                          color: busy || saidaJaDeclarada ? '#94a3b8' : '#fff',
                          border: 'none',
                          cursor: busy || saidaJaDeclarada ? 'not-allowed' : 'pointer',
                        }}
                        disabled={busy || saidaJaDeclarada}
                        onClick={() =>
                          void acao(
                            c.id,
                            'SAIDA_PATIO',
                            `Saída do pátio declarada via /entregas (coleta ${c.nf})`,
                          )
                        }
                        title={saidaJaDeclarada ? 'Saída já foi declarada (fimPatioAt já existe).' : 'SAIDA_PATIO'}
                      >
                        {saidaJaDeclarada ? 'Saída já declarada' : busy ? 'Registrando…' : 'Declarar saída do pátio'}
                      </button>

                      <button
                        style={{
                          ...btnMini,
                          background: busy ? '#f1f5f9' : '#f59e0b',
                          color: busy ? '#94a3b8' : '#fff',
                          border: 'none',
                        }}
                        disabled={busy}
                        onClick={() =>
                          void acao(
                            c.id,
                            'EM_TRANSITO',
                            `Coleta marcada como EM_TRANSITO via /entregas (NF ${c.nf})`,
                          )
                        }
                        title="POST /api/coletas/[id]/acao (EM_TRANSITO)"
                      >
                        {busy ? 'Registrando…' : 'Marcar EM_TRANSITO'}
                      </button>

                      <button
                        style={{
                          ...btnMini,
                          background: busy ? '#f1f5f9' : '#38bdf8',
                          color: busy ? '#94a3b8' : '#fff',
                          border: 'none',
                        }}
                        disabled={busy}
                        onClick={() =>
                          void acao(
                            c.id,
                            'ENTREGUE',
                            `Entrega declarada via /entregas (NF ${c.nf})`,
                          )
                        }
                        title="POST /api/coletas/[id]/acao (ENTREGUE)"
                      >
                        {busy ? 'Registrando…' : 'Marcar ENTREGUE'}
                      </button>

                      <span style={{ fontSize: 11, opacity: 0.75 }}>
                        ID: <code>{c.id}</code>
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}

            {list.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 16, opacity: 0.8 }}>
                  {loading ? 'Carregando…' : '(Sem coletas para exibir)'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
        Obs: a tela <b>/rotas/[id]</b> mostra o status da <b>PARADA</b> (execução). Aqui é o status da <b>COLETA</b>.
      </div>
    </div>
  );
}