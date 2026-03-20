'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

type Item = {
  id: string;
  etiqueta: string;
  status: 'PENDENTE' | 'OK' | 'FALTA' | 'AVARIA';
  checkedAt: string | null;
  checkedBy: string | null;
  note: string | null;
  updatedAt: string;
};

type Resp = {
  ok: boolean;
  minuta?: { id: string; nfNumero: string; cliente: string; cidade: string; uf: string; numero?: string | null } | null;
  conferencia?: {
    id: string;
    status: 'ABERTO' | 'CONFERIDO' | 'SAIDA_LIBERADA';
    conferente: string | null;
    motorista: string | null;
    placa: string | null;
    observacao: string | null;
    startedAt: string;
    finishedAt: string | null;
  };
  itens?: Item[];
  error?: string;
};

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR');
  } catch {
    return String(iso);
  }
}

function badge(s: Item['status']) {
  if (s === 'OK') return { bg: '#dcfce7', fg: '#166534', label: 'OK' };
  if (s === 'FALTA') return { bg: '#fee2e2', fg: '#991b1b', label: 'FALTA' };
  if (s === 'AVARIA') return { bg: '#fde68a', fg: '#92400e', label: 'AVARIA' };
  return { bg: '#e2e8f0', fg: '#0f172a', label: 'PENDENTE' };
}

export default function CarregamentoMinutaPage() {
  const params = useParams<{ id: string }>();
  const minutaId = String(params?.id || '').trim();

  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [scan, setScan] = useState('');
  const scanRef = useRef<HTMLInputElement | null>(null);

  const [checkedBy, setCheckedBy] = useState<string>('');
  const [conferente, setConferente] = useState<string>('');
  const [motorista, setMotorista] = useState<string>('');
  const [placa, setPlaca] = useState<string>('');
  const [observacao, setObservacao] = useState<string>('');

  const [savingMeta, setSavingMeta] = useState(false);
  const [savingMsg, setSavingMsg] = useState<string>('');

  const itens = resp?.itens || [];

  const summary = useMemo(() => {
    let pend = 0, ok = 0, falta = 0, avaria = 0;
    for (const it of itens) {
      if (it.status === 'OK') ok++;
      else if (it.status === 'FALTA') falta++;
      else if (it.status === 'AVARIA') avaria++;
      else pend++;
    }
    return { total: itens.length, pend, ok, falta, avaria };
  }, [itens]);

  async function load() {
    if (!minutaId) return;
    try {
      setLoading(true);
      setErr(null);

      const res = await fetch(`/api/minutas/${encodeURIComponent(minutaId)}/carregamento`, { cache: 'no-store' });
      const j = (await res.json().catch(() => null)) as Resp | null;

      if (!res.ok || !j || !j.ok) throw new Error(j?.error || 'Falha ao carregar checklist');
      setResp(j);

      setConferente(j.conferencia?.conferente ?? '');
      setMotorista(j.conferencia?.motorista ?? '');
      setPlaca(j.conferencia?.placa ?? '');
      setObservacao(j.conferencia?.observacao ?? '');
    } catch (e: any) {
      setErr(e?.message || 'Falha ao carregar');
      setResp(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutaId]);

  async function doScan(status: Item['status'] = 'OK') {
    const etq = scan.trim();
    if (!etq) return;

    try {
      setSavingMsg('');
      const res = await fetch(`/api/minutas/${encodeURIComponent(minutaId)}/carregamento/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etiqueta: etq, status, checkedBy: checkedBy || null }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.ok === false) throw new Error(j?.error || 'Falha ao registrar leitura');

      setScan('');
      setTimeout(() => scanRef.current?.focus(), 50);

      await load();
    } catch (e: any) {
      setErr(e?.message || 'Falha no scan');
    }
  }

  async function setItemStatus(itemId: string, etiqueta: string, status: Item['status']) {
    try {
      setSavingMsg('');
      // usa o endpoint de check (upsert) para manter idempotência e audit
      const res = await fetch(`/api/minutas/${encodeURIComponent(minutaId)}/carregamento/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etiqueta, status, checkedBy: checkedBy || null }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.ok === false) throw new Error(j?.error || 'Falha ao atualizar item');

      await load();
    } catch (e: any) {
      setErr(e?.message || 'Falha ao atualizar item');
    }
  }

  async function salvarMeta() {
    try {
      setSavingMeta(true);
      setSavingMsg('');
      setErr(null);

      const res = await fetch(`/api/minutas/${encodeURIComponent(minutaId)}/carregamento`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conferente: conferente || null,
          motorista: motorista || null,
          placa: placa || null,
          observacao: observacao || null,
        }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.ok === false) throw new Error(j?.error || 'Falha ao salvar');

      setSavingMsg('Metadados salvos.');
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Falha ao salvar');
    } finally {
      setSavingMeta(false);
    }
  }

  async function mudarStatusConferencia(status: 'ABERTO' | 'CONFERIDO' | 'SAIDA_LIBERADA') {
    try {
      setSavingMeta(true);
      setSavingMsg('');
      setErr(null);

      const res = await fetch(`/api/minutas/${encodeURIComponent(minutaId)}/carregamento`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.ok === false) throw new Error(j?.error || 'Falha ao mudar status');

      setSavingMsg(`Status atualizado: ${status}.`);
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Falha ao mudar status');
    } finally {
      setSavingMeta(false);
    }
  }

  const card: React.CSSProperties = {
    marginTop: 12,
    padding: 14,
    borderRadius: 10,
    border: '1px solid rgba(148,163,184,0.25)',
    background: 'rgba(15,23,42,0.35)',
  };

  const btn: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 900,
  };

  const input: React.CSSProperties = {
    width: '100%',
    padding: 10,
    borderRadius: 10,
    border: '1px solid rgba(148,163,184,0.35)',
    background: '#0b1220',
    color: '#e5e7eb',
    outline: 'none',
  };

  return (
    <div style={{ padding: 16, background: '#0b1220', minHeight: '100vh', color: '#e5e7eb' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>Carregamento — Checklist (Minuta)</h1>
          <div style={{ color: '#93c5fd', fontSize: 12, marginTop: 6 }}>
            MinutaId: <code>{minutaId}</code>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/minutas" style={{ ...btn, background: '#1A4A1A', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            Voltar
          </Link>

          <button onClick={() => void load()} style={{ ...btn, background: '#1A4A1A', color: '#fff' }} disabled={loading}>
            {loading ? 'Recarregando…' : 'Recarregar'}
          </button>

          <a
            href={`/api/minutas/${encodeURIComponent(minutaId)}/carregamento?format=csv`}
            target="_blank"
            rel="noreferrer"
            style={{ ...btn, background: '#10b981', color: '#0b1220', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            Exportar checklist CSV
          </a>
        </div>
      </div>

      {err && <div style={{ marginTop: 12, color: '#fca5a5', fontWeight: 900 }}>{err}</div>}
      {savingMsg && <div style={{ marginTop: 12, color: '#86efac', fontWeight: 900 }}>{savingMsg}</div>}

      <div style={card}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>NF</div>
            <div style={{ fontWeight: 900 }}>{resp?.minuta?.nfNumero ?? '-'}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Cliente</div>
            <div style={{ fontWeight: 900 }}>{resp?.minuta?.cliente ?? '-'}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Cidade/UF</div>
            <div style={{ fontWeight: 900 }}>{resp?.minuta ? `${resp.minuta.cidade} / ${resp.minuta.uf}` : '-'}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Status conferência</div>
            <div style={{ fontWeight: 900 }}>{resp?.conferencia?.status ?? '-'}</div>
          </div>
        </div>

        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
          <span style={{ padding: '2px 10px', borderRadius: 999, background: '#e2e8f0', color: '#0f172a' }}>Total: {summary.total}</span>
          <span style={{ padding: '2px 10px', borderRadius: 999, background: '#e5e7eb', color: '#4b5563' }}>Pendente: {summary.pend}</span>
          <span style={{ padding: '2px 10px', borderRadius: 999, background: '#dcfce7', color: '#166534' }}>OK: {summary.ok}</span>
          <span style={{ padding: '2px 10px', borderRadius: 999, background: '#fee2e2', color: '#991b1b' }}>Falta: {summary.falta}</span>
          <span style={{ padding: '2px 10px', borderRadius: 999, background: '#fde68a', color: '#92400e' }}>Avaria: {summary.avaria}</span>
        </div>
      </div>

      <div style={card}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Scanner (opcional)</h2>
        <div style={{ marginTop: 10, display: 'grid', gap: 10, gridTemplateColumns: '2fr 1fr' }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Cole/escaneie a etiqueta e pressione Enter</div>
            <input
              ref={scanRef}
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doScan('OK');
              }}
              style={input}
              placeholder="ETQ:XXXX ou XXXX"
            />
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => void doScan('OK')} style={{ ...btn, background: '#22c55e', color: '#0b1220' }}>
                Marcar OK
              </button>
              <button onClick={() => void doScan('FALTA')} style={{ ...btn, background: '#ef4444', color: '#0b1220' }}>
                Marcar FALTA
              </button>
              <button onClick={() => void doScan('AVARIA')} style={{ ...btn, background: '#f59e0b', color: '#0b1220' }}>
                Marcar AVARIA
              </button>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Identificação (opcional)</div>
            <input value={checkedBy} onChange={(e) => setCheckedBy(e.target.value)} style={input} placeholder="Conferente (nome)" />
          </div>
        </div>
      </div>

      <div style={card}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Dados do carregamento</h2>

        <div style={{ marginTop: 10, display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr 1fr' }}>
          <input value={conferente} onChange={(e) => setConferente(e.target.value)} style={input} placeholder="Conferente" />
          <input value={motorista} onChange={(e) => setMotorista(e.target.value)} style={input} placeholder="Motorista" />
          <input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} style={input} placeholder="Placa" />
        </div>

        <div style={{ marginTop: 10 }}>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            style={{ ...input, minHeight: 80, resize: 'vertical' }}
            placeholder="Observações"
          />
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => void salvarMeta()} disabled={savingMeta} style={{ ...btn, background: '#38bdf8', color: '#0b1220', opacity: savingMeta ? 0.7 : 1 }}>
            {savingMeta ? 'Salvando…' : 'Salvar dados'}
          </button>

          <button onClick={() => void mudarStatusConferencia('CONFERIDO')} disabled={savingMeta} style={{ ...btn, background: '#22c55e', color: '#0b1220', opacity: savingMeta ? 0.7 : 1 }}>
            Finalizar conferência (CONFERIDO)
          </button>

          <button onClick={() => void mudarStatusConferencia('SAIDA_LIBERADA')} disabled={savingMeta} style={{ ...btn, background: '#a78bfa', color: '#0b1220', opacity: savingMeta ? 0.7 : 1 }}>
            Liberar saída (SAIDA_LIBERADA)
          </button>

          <button onClick={() => void mudarStatusConferencia('ABERTO')} disabled={savingMeta} style={{ ...btn, background: '#1A4A1A', color: '#fff', opacity: savingMeta ? 0.7 : 1 }}>
            Reabrir (ABERTO)
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
          Início: <b>{fmtDate(resp?.conferencia?.startedAt)}</b> • Fim: <b>{fmtDate(resp?.conferencia?.finishedAt)}</b>
        </div>
      </div>

      <div style={card}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Checklist de etiquetas</h2>

        <div style={{ marginTop: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(2,6,23,0.45)' }}>
                <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Etiqueta</th>
                <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Status</th>
                <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Checado em</th>
                <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Checado por</th>
                <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Obs</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it) => {
                const b = badge(it.status);
                return (
                  <tr key={it.id} style={{ borderTop: '1px solid rgba(148,163,184,0.18)' }}>
                    <td style={{ padding: 10 }}>
                      <code>{it.etiqueta}</code>
                    </td>
                    <td style={{ padding: 10 }}>
                      <select
                        value={it.status}
                        onChange={(e) => void setItemStatus(it.id, it.etiqueta, e.target.value as any)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 999,
                          border: '1px solid rgba(148,163,184,0.35)',
                          background: b.bg,
                          color: b.fg,
                          fontWeight: 900,
                        }}
                      >
                        <option value="PENDENTE">PENDENTE</option>
                        <option value="OK">OK</option>
                        <option value="FALTA">FALTA</option>
                        <option value="AVARIA">AVARIA</option>
                      </select>
                    </td>
                    <td style={{ padding: 10, fontWeight: 800 }}>{it.checkedAt ? fmtDate(it.checkedAt) : '—'}</td>
                    <td style={{ padding: 10, fontWeight: 800 }}>{it.checkedBy ?? '—'}</td>
                    <td style={{ padding: 10, opacity: 0.85 }}>{it.note ?? '—'}</td>
                  </tr>
                );
              })}

              {itens.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 14, opacity: 0.8 }}>
                    {loading ? 'Carregando…' : '(Sem etiquetas/volumes na minuta)'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}