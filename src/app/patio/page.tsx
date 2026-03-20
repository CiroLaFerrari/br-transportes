// src/app/patio/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type ColetaRow = {
  id: string;
  nf: string;
  cidade: string;
  uf: string;
  status: 'EM_PATIO' | 'CARREGADA' | 'EM_TRANSITO' | 'ENTREGUE';
  entradaPatioAt: string | null;
  embarqueAt: string | null;
  fimPatioAt: string | null;
  pesoTotalKg: number | null;
  valorFrete: number | null;
  prazoEntrega: string | null;
  urgencia: string;
  Cliente?: { id: string; razao: string | null } | null;
};

/**
 * ✅ Compatível com:
 * - formato novo: { ok, porColeta: { [coletaId]: { volumeM3, pesoKg } }, ... }
 * - formato antigo: { data: [{ coletaId, volumeTotalM3... }] } ou array direto
 */
type MetricasResp =
  | {
      ok?: boolean;
      error?: string;
      porColeta?: Record<string, { pesoKg?: number | null; volumeM3?: number | null }>;
      data?: Array<{
        coletaId: string;
        pesoTotalKg?: number | null;
        valorFrete?: number | null;
        volumeTotalM3?: number | null;
        volumeM3?: number | null;
      }>;
    }
  | Array<any>;

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

function sum(nums: Array<number | null | undefined>) {
  return nums.reduce((acc, v) => acc + (Number.isFinite(Number(v)) ? Number(v) : 0), 0);
}

function pickM3(row: any): number {
  const candidates = [row?.volumeTotalM3, row?.volumeM3, row?.totalM3, row?.m3Total, row?.volumesM3, row?.m3, row?.volume];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export default function PatioPage() {
  const [q, setQ] = useState('');
  const [uf, setUf] = useState('');
  const [cidade, setCidade] = useState('');
  const [limit, setLimit] = useState(200);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [list, setList] = useState<ColetaRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const [acaoMsg, setAcaoMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // ✅ Volume por coleta
  const [metricasMap, setMetricasMap] = useState<Record<string, { volumeM3: number }>>({});
  const [metricasErr, setMetricasErr] = useState<string | null>(null);

  async function loadMetricas(ids: string[]) {
    try {
      setMetricasErr(null);
      if (!ids.length) return;

      const res = await fetch('/api/coletas/metricas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });

      const j = (await res.json().catch(() => null)) as MetricasResp | null;
      if (!res.ok || !j) throw new Error((j as any)?.error || 'Falha ao carregar métricas');

      const map: Record<string, { volumeM3: number }> = {};

      // ✅ NOVO: porColeta
      const porColeta = !Array.isArray(j) ? (j as any)?.porColeta : null;
      if (porColeta && typeof porColeta === 'object') {
        for (const [coletaId, v] of Object.entries(porColeta)) {
          const n = Number((v as any)?.volumeM3 ?? 0);
          map[String(coletaId)] = { volumeM3: Number.isFinite(n) ? n : 0 };
        }
        setMetricasMap(map);
        return;
      }

      // ✅ ANTIGO: array direto ou { data: [] }
      const arr = Array.isArray(j) ? j : Array.isArray((j as any)?.data) ? (j as any).data : [];

      for (const row of arr as any[]) {
        const coletaId = String(row?.coletaId || row?.id || '').trim();
        if (!coletaId) continue;
        map[coletaId] = { volumeM3: pickM3(row) };
      }

      setMetricasMap(map);
    } catch (e: any) {
      setMetricasErr(e?.message || 'Falha ao carregar métricas');
      setMetricasMap({});
    }
  }

  async function load() {
    setLoading(true);
    setErr(null);
    setAcaoMsg(null);

    try {
      const qs = new URLSearchParams();
      qs.set('limit', String(limit));
      qs.set('status', 'EM_PATIO');

      const qParts: string[] = [];
      if (q.trim()) qParts.push(q.trim());
      if (uf.trim()) qParts.push(uf.trim());
      if (cidade.trim()) qParts.push(cidade.trim());
      if (qParts.length) qs.set('q', qParts.join(' '));

      const res = await fetch('/api/coletas?' + qs.toString(), { cache: 'no-store' });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'Falha ao carregar coletas do pátio');

      const arr: ColetaRow[] = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [];
      setList(arr);

      setSelected((prev) => {
        const next: Record<string, boolean> = {};
        for (const c of arr) next[c.id] = Boolean(prev[c.id]);
        return next;
      });

      // ✅ carrega volume do pátio
      const ids = Array.from(new Set(arr.map((x) => x.id)));
      if (ids.length) void loadMetricas(ids);
    } catch (e: any) {
      setErr(e?.message || 'Falha ao carregar');
      setList([]);
      setSelected({});
      setMetricasMap({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedIds = useMemo(() => {
    return Object.entries(selected)
      .filter(([_, v]) => v)
      .map(([k]) => k);
  }, [selected]);

  const resumo = useMemo(() => {
    const total = list.length;

    const pesoTotal = sum(list.map((c) => c.pesoTotalKg));
    const freteTotal = sum(list.map((c) => c.valorFrete));
    const volumeTotal = sum(list.map((c) => metricasMap[c.id]?.volumeM3 ?? 0));

    const selectedList = list.filter((c) => selected[c.id]);
    const selTotal = selectedList.length;
    const selPeso = sum(selectedList.map((c) => c.pesoTotalKg));
    const selFrete = sum(selectedList.map((c) => c.valorFrete));
    const selVolume = sum(selectedList.map((c) => metricasMap[c.id]?.volumeM3 ?? 0));

    const porUfAll: Record<string, number> = {};
    const porUfSel: Record<string, number> = {};

    for (const c of list) {
      const k = (c.uf || '').toUpperCase() || '??';
      porUfAll[k] = (porUfAll[k] || 0) + 1;
    }
    for (const c of selectedList) {
      const k = (c.uf || '').toUpperCase() || '??';
      porUfSel[k] = (porUfSel[k] || 0) + 1;
    }

    const mediaDias = (() => {
      const vals = list
        .map((c) => diffDays(c.entradaPatioAt, c.fimPatioAt))
        .filter((n): n is number => typeof n === 'number');
      if (!vals.length) return null;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    })();

    return {
      total,
      pesoTotal,
      volumeTotal,
      freteTotal,
      mediaDias,

      selTotal,
      selPeso,
      selVolume,
      selFrete,

      porUfAll,
      porUfSel,
    };
  }, [list, selected, metricasMap]);

  function toggleOne(id: string, val: boolean) {
    setSelected((prev) => ({ ...prev, [id]: val }));
  }

  function toggleAll(val: boolean) {
    const next: Record<string, boolean> = {};
    for (const c of list) next[c.id] = val;
    setSelected(next);
  }

  async function copiarIds() {
    const text = selectedIds.join('\n');
    if (!text) {
      alert('Selecione ao menos 1 coleta.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setAcaoMsg(`OK: ${selectedIds.length} coleta(s) copiadas (IDs). Cole em Planejamentos → "IDs de coletas".`);
    } catch {
      alert('Não consegui copiar automaticamente. Selecione e copie manualmente: \n\n' + text);
    }
  }

  async function bulkSaidaPatio() {
    if (selectedIds.length === 0) return;
    const ok = confirm(`Declarar saída do pátio para ${selectedIds.length} coleta(s) selecionadas?`);
    if (!ok) return;

    try {
      setBusyId('__bulk__');
      setAcaoMsg(null);
      setErr(null);

      let successCount = 0;
      let failCount = 0;

      for (const coletaId of selectedIds) {
        try {
          const res = await fetch(`/api/coletas/${encodeURIComponent(coletaId)}/acao`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'SAIDA_PATIO', note: 'Saída do pátio em lote via /patio' }),
          });
          if (res.ok) successCount++;
          else failCount++;
        } catch {
          failCount++;
        }
      }

      setAcaoMsg(`Saída pátio em lote: ${successCount} OK, ${failCount} falha(s).`);
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Falha na ação em lote');
    } finally {
      setBusyId(null);
    }
  }

  async function declararSaidaPatio(coletaId: string, nf: string) {
    const ok = confirm(`Declarar saída do pátio para a coleta ${nf || coletaId}?\n\nObs: é idempotente.`);
    if (!ok) return;

    try {
      setBusyId(coletaId);
      setAcaoMsg(null);
      setErr(null);

      const res = await fetch(`/api/coletas/${encodeURIComponent(coletaId)}/acao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SAIDA_PATIO',
          note: `Saída do pátio declarada via /patio (coleta ${nf || coletaId})`,
        }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || j?.ok === false) throw new Error(j?.error || 'Falha ao declarar saída do pátio');

      setAcaoMsg(`OK: saída do pátio registrada/confirmada para ${nf || coletaId}.`);
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

  const fmtMoney = (n: number) => Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  const fmtKg = (n: number) => Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(n);
  const fmtM3 = (n: number) => Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(n);

  return (
    <div style={page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, color: '#1A4A1A' }}>Cargas no Pátio</h1>
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>Coletas EM_PATIO • seleção para planejamento • lead time e volume (m³)</div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link
            href="/planejamentos"
            style={{
              ...btn,
              background: '#38bdf8',
              color: '#fff',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Abra Planejamentos e cole os IDs selecionados em 'IDs de coletas'"
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

          <Link
            href="/entregas"
            style={{
              ...btn,
              background: '#1A4A1A',
              color: '#fff',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Ir para Entregas
          </Link>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar (NF, cliente, etc.)" style={{ ...input, width: 320 }} />
          <input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Cidade" style={{ ...input, width: 220 }} />
          <input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} placeholder="UF" style={{ ...input, width: 90, textTransform: 'uppercase' }} maxLength={2} />

          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ ...input, width: 120 } as any} title="Quantidade máxima para listar">
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>

          <button
            onClick={() => void load()}
            disabled={loading}
            style={{
              ...btn,
              background: loading ? '#64748b' : '#1A4A1A',
              color: '#fff',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Carregando…' : 'Recarregar'}
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => void toggleAll(true)} disabled={loading || list.length === 0} style={{ ...btnMini, background: '#0ea5e9', color: '#fff', border: 'none' }}>
              Selecionar tudo
            </button>
            <button onClick={() => void toggleAll(false)} disabled={loading || list.length === 0} style={{ ...btnMini, background: '#1A4A1A', color: '#fff', border: 'none' }}>
              Limpar seleção
            </button>
            <button onClick={() => void copiarIds()} disabled={selectedIds.length === 0} style={{ ...btnMini, background: '#F5BE16', color: '#1A4A1A', border: 'none' }} title="Copia os IDs selecionados para colar em Planejamentos">
              Copiar IDs ({selectedIds.length})
            </button>
            <button
              onClick={() => void bulkSaidaPatio()}
              disabled={selectedIds.length === 0 || !!busyId}
              style={{ ...btnMini, background: '#ef4444', color: '#fff', border: 'none', opacity: selectedIds.length === 0 || busyId ? 0.5 : 1 }}
              title="Declarar saída do pátio para todas as coletas selecionadas"
            >
              {busyId === '__bulk__' ? 'Processando…' : `Saída pátio (${selectedIds.length})`}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, opacity: 0.9 }}>
          <span>
            Total no pátio: <b>{resumo.total}</b>
          </span>
          <span>
            Peso total: <b>{fmtKg(resumo.pesoTotal)} kg</b>
          </span>
          <span>
            Volume total: <b>{fmtM3(resumo.volumeTotal)} m³</b>
          </span>
          <span>
            Frete total: <b>{fmtMoney(resumo.freteTotal)}</b>
          </span>
          <span>
            Média lead (dias): <b>{resumo.mediaDias == null ? '—' : resumo.mediaDias.toFixed(2)}</b>
          </span>
          <span style={{ marginLeft: 12 }}>
            Selecionadas: <b>{resumo.selTotal}</b> • <b>{fmtKg(resumo.selPeso)} kg</b> • <b>{fmtM3(resumo.selVolume)} m³</b> • <b>{fmtMoney(resumo.selFrete)}</b>
          </span>
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, opacity: 0.9 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Resumo por UF (todas)</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.keys(resumo.porUfAll)
                .sort()
                .map((k) => (
                  <span
                    key={k}
                    style={{
                      padding: '2px 10px',
                      borderRadius: 999,
                      background: '#f1f5f9',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <b>{k}</b>: {resumo.porUfAll[k]}
                  </span>
                ))}
              {!Object.keys(resumo.porUfAll).length && <span>—</span>}
            </div>
          </div>

          <div style={{ fontSize: 12, opacity: 0.9 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Resumo por UF (selecionadas)</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.keys(resumo.porUfSel)
                .sort()
                .map((k) => (
                  <span
                    key={k}
                    style={{
                      padding: '2px 10px',
                      borderRadius: 999,
                      background: '#dcfce7',
                      border: '1px solid #86efac',
                    }}
                  >
                    <b>{k}</b>: {resumo.porUfSel[k]}
                  </span>
                ))}
              {!Object.keys(resumo.porUfSel).length && <span>—</span>}
            </div>
          </div>
        </div>

        {err && <div style={{ marginTop: 10, color: '#dc2626', fontWeight: 900 }}>{err}</div>}
        {metricasErr && <div style={{ marginTop: 10, color: '#dc2626', fontWeight: 900 }}>{metricasErr}</div>}
        {acaoMsg && <div style={{ marginTop: 10, color: '#16a34a', fontWeight: 900 }}>{acaoMsg}</div>}
      </div>

      <div style={{ ...card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Sel</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>NF</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Cliente</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Cidade/UF</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Peso (kg)</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Volume (m³)</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Frete</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Urgência</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Prazo</th>
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

              const m3 = metricasMap[c.id]?.volumeM3 ?? 0;

              return (
                <tr key={c.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: 10 }}>
                    <input type="checkbox" checked={!!selected[c.id]} onChange={(e) => toggleOne(c.id, e.target.checked)} />
                  </td>

                  <td style={{ padding: 10, fontWeight: 900 }}>{c.nf}</td>
                  <td style={{ padding: 10 }}>{c.Cliente?.razao ?? '—'}</td>
                  <td style={{ padding: 10 }}>
                    {c.cidade} / {c.uf}
                  </td>
                  <td style={{ padding: 10, fontWeight: 800 }}>{c.pesoTotalKg == null ? '—' : fmtKg(c.pesoTotalKg)}</td>
                  <td style={{ padding: 10, fontWeight: 800 }}>{fmtM3(m3)}</td>
                  <td style={{ padding: 10, fontWeight: 800 }}>{c.valorFrete == null ? '—' : fmtMoney(c.valorFrete)}</td>
                  <td style={{ padding: 10, fontWeight: 800, color: c.urgencia === 'URGENTE' ? '#ef4444' : c.urgencia === 'ALTA' ? '#f59e0b' : undefined }}>{c.urgencia || 'NORMAL'}</td>
                  <td style={{ padding: 10 }}>{c.prazoEntrega ? new Date(c.prazoEntrega).toLocaleDateString('pt-BR') : '—'}</td>
                  <td style={{ padding: 10, fontWeight: 800 }}>{fmtDate(c.entradaPatioAt)}</td>
                  <td style={{ padding: 10, fontWeight: 800 }}>{fmtDate(c.fimPatioAt)}</td>
                  <td style={{ padding: 10, fontWeight: 900, color: lead != null && lead > 30 ? '#f87171' : undefined }}>{lead == null ? '—' : `${lead.toFixed(2)}${aberto ? ' (aberto)' : ''}`}</td>

                  <td style={{ padding: 10 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Link
                        href={`/coletas/${c.id}`}
                        style={{
                          ...btnMini,
                          background: '#0ea5e9',
                          color: '#fff',
                          border: 'none',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        Abrir
                      </Link>

                      <button
                        style={{
                          ...btnMini,
                          background: busy ? '#f1f5f9' : '#22c55e',
                          color: busy ? '#94a3b8' : '#fff',
                          border: 'none',
                        }}
                        disabled={busy}
                        onClick={() => void declararSaidaPatio(c.id, c.nf)}
                        title="POST /api/coletas/[id]/acao (SAIDA_PATIO). Idempotente."
                      >
                        {busy ? 'Registrando…' : 'Saída do pátio'}
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
                <td colSpan={11} style={{ padding: 16, opacity: 0.8 }}>
                  {loading ? 'Carregando…' : '(Sem coletas EM_PATIO para exibir)'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, opacity: 0.8, fontSize: 12 }}>
        Fluxo rápido: selecione coletas → <b>Copiar IDs</b> → abra <b>/planejamentos</b> → cole em “IDs de coletas” → “Vincular coletas” → “1 clique: gerar rota + abrir /scan”.
      </div>
    </div>
  );
}