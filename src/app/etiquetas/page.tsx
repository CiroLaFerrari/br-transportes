'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type EtiquetaRow = {
  id: string;
  etiqueta: string;
  status: string;
  scannedAt: string | null;
  createdAt: string;
  coletaId: string | null;
  nf: string;
  cidade: string;
  uf: string;
  coletaStatus: string | null;
  cliente: string;
  produtoCodigo: string;
  produtoDescricao: string;
  pesoKg: number | null;
  quantidade: number;
};

type Counts = {
  total: number;
  emPatio: number;
  carregada: number;
  emTransito: number;
  entregue: number;
};

const STATUS_COLORS: Record<string, string> = {
  EM_PATIO: '#f59e0b',
  CARREGADA: '#3b82f6',
  EM_TRANSITO: '#8b5cf6',
  ENTREGUE: '#22c55e',
};

const STATUS_LABELS: Record<string, string> = {
  EM_PATIO: 'Pátio',
  CARREGADA: 'Carregada',
  EM_TRANSITO: 'Trânsito',
  ENTREGUE: 'Entregue',
};

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return String(iso);
  }
}

export default function EtiquetasPage() {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<EtiquetaRow[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (q.trim()) params.set('q', q.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const res = await fetch(`/api/etiquetas?${params.toString()}`, { cache: 'no-store' });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Falha ao carregar etiquetas');

      setRows(j.data || []);
      setCounts(j.counts || null);
    } catch (e: any) {
      setErr(e?.message || 'Erro ao carregar');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.id)));
    }
  }

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  function printSelected() {
    if (selectedRows.length === 0) return;
    // Open each selected etiqueta in a new tab for printing
    for (const r of selectedRows) {
      window.open(`/etiquetas/${encodeURIComponent(r.etiqueta)}`, '_blank');
    }
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>Etiquetas</h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Rastreio de volumes por código de etiqueta</p>
        </div>
        {selected.size > 0 && (
          <button onClick={printSelected} style={btnPrimary}>
            Imprimir {selected.size} etiqueta(s)
          </button>
        )}
      </div>

      {/* Status counters */}
      {counts && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <CountBadge label="Total" value={counts.total} color="#334155" />
          <CountBadge label="Pátio" value={counts.emPatio} color="#f59e0b" />
          <CountBadge label="Carregada" value={counts.carregada} color="#3b82f6" />
          <CountBadge label="Trânsito" value={counts.emTransito} color="#8b5cf6" />
          <CountBadge label="Entregue" value={counts.entregue} color="#22c55e" />
        </div>
      )}

      {/* Filters */}
      <div style={{ ...card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <label>
          <div style={labelStyle}>Buscar</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Etiqueta, NF, cliente, cidade, produto..."
            style={{ ...inputStyle, width: 320 }}
          />
        </label>
        <label>
          <div style={labelStyle}>Status</div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 160 }}>
            <option value="ALL">Todos</option>
            <option value="EM_PATIO">EM_PATIO</option>
            <option value="CARREGADA">CARREGADA</option>
            <option value="EM_TRANSITO">EM_TRANSITO</option>
            <option value="ENTREGUE">ENTREGUE</option>
          </select>
        </label>
        <button onClick={load} disabled={loading} style={btnPrimary}>
          {loading ? 'Carregando...' : 'Filtrar'}
        </button>
      </div>

      {err && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      {/* Table */}
      <div style={{ ...card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ ...thStyle, width: 40 }}>
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={toggleAll}
                />
              </th>
              <th style={thStyle}>Etiqueta</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>NF</th>
              <th style={thStyle}>Cliente</th>
              <th style={thStyle}>Cidade/UF</th>
              <th style={thStyle}>Produto</th>
              <th style={thStyle}>Qtd</th>
              <th style={thStyle}>Scaneada</th>
              <th style={thStyle}>Criada</th>
              <th style={thStyle}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={tdStyle}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
                </td>
                <td style={{ ...tdStyle, fontWeight: 700, fontFamily: 'monospace' }}>
                  <Link href={`/etiquetas/${encodeURIComponent(r.etiqueta)}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                    {r.etiqueta}
                  </Link>
                </td>
                <td style={tdStyle}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#fff',
                      background: STATUS_COLORS[r.status] || '#94a3b8',
                    }}
                  >
                    {STATUS_LABELS[r.status] || r.status}
                  </span>
                </td>
                <td style={tdStyle}>
                  {r.coletaId ? (
                    <Link href={`/coletas/${r.coletaId}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                      {r.nf}
                    </Link>
                  ) : (
                    r.nf
                  )}
                </td>
                <td style={tdStyle}>{r.cliente}</td>
                <td style={tdStyle}>{r.cidade}/{r.uf}</td>
                <td style={tdStyle}>
                  <span style={{ fontWeight: 600 }}>{r.produtoCodigo}</span>
                  <br />
                  <span style={{ fontSize: 11, color: '#64748b' }}>{r.produtoDescricao}</span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>{r.quantidade}</td>
                <td style={tdStyle}>{r.scannedAt ? fmtDate(r.scannedAt) : '—'}</td>
                <td style={tdStyle}>{fmtDate(r.createdAt)}</td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Link
                      href={`/etiquetas/${encodeURIComponent(r.etiqueta)}`}
                      style={btnSmall}
                    >
                      Ver / Imprimir
                    </Link>
                    <Link
                      href={`/scan?etiqueta=${encodeURIComponent(r.etiqueta)}`}
                      style={{ ...btnSmall, background: '#eff6ff', color: '#1d4ed8' }}
                    >
                      Scan
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: 20 }}>
                  {loading ? 'Carregando...' : 'Nenhuma etiqueta encontrada.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: '#94a3b8' }}>
        Mostrando {rows.length} etiquetas. Cada etiqueta corresponde a um volume (ItemVolume) vinculado a uma coleta.
      </div>
    </div>
  );
}

// ====== Sub-components ======

function CountBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        padding: '6px 14px',
        borderRadius: 999,
        background: `${color}15`,
        border: `1px solid ${color}40`,
        fontSize: 12,
        fontWeight: 600,
        color,
      }}
    >
      {label}: <b>{value}</b>
    </div>
  );
}

// ====== Styles ======

const card: React.CSSProperties = {
  padding: 16,
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  background: '#fff',
  boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
};

const labelStyle: React.CSSProperties = { fontSize: 12, color: '#64748b', marginBottom: 2 };

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  fontSize: 13,
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 6,
  border: 'none',
  background: '#1A4A1A',
  color: '#fff',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
};

const btnSmall: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid #e2e8f0',
  background: '#f8fafc',
  color: '#334155',
  fontSize: 11,
  fontWeight: 600,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontWeight: 700,
  color: '#475569',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '2px solid #e2e8f0',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  color: '#334155',
};
