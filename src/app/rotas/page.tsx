// src/app/rotas/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

type RotaListItem = {
  id: string;
  dataRota: string | null;
  status: string;
  kmTotal: number | null;
  freteTotal: number | null;
  motoristaId: string | null;
  veiculoId: string | null;
  createdAt: string;
  updatedAt: string;
  totalParadas: number;
  entregues: number;
};

type ApiResp = {
  ok: boolean;
  data?: RotaListItem[];
  page?: number;
  limit?: number;
  total?: number;
  hasMore?: boolean;
  error?: string;
};

function fmtDate(iso?: string | null) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  } catch {
    return String(iso);
  }
}

async function safeJson(res: Response) {
  return await res.json().catch(() => null);
}

export default function RotasPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [rows, setRows] = useState<RotaListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  async function load(p = page) {
    try {
      setLoading(true);
      setErr(null);

      const qs = new URLSearchParams();
      qs.set('page', String(p));
      qs.set('limit', String(limit));
      // (se você quiser filtro no backend depois, dá pra usar ?q=... e implementar no GET /api/rotas)
      if (q.trim()) qs.set('q', q.trim());

      const res = await fetch(`/api/rotas?${qs.toString()}`, { cache: 'no-store' });
      const j = (await safeJson(res)) as ApiResp | null;

      if (!res.ok || !j || !j.ok) throw new Error((j as any)?.error || 'Falha ao listar rotas');

      setRows(Array.isArray(j.data) ? j.data : []);
      setPage(Number(j.page || p));
      setLimit(Number(j.limit || limit));
      setTotal(Number(j.total || 0));
      setHasMore(Boolean(j.hasMore));
    } catch (e: any) {
      setErr(e?.message || 'Falha ao listar rotas');
      setRows([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pageStyle: React.CSSProperties = {
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

  const btn: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
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
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, color: '#1A4A1A' }}>Rotas</h1>
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
            Lista • status • progresso • abrir detalhes
          </div>
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
          >
            Ir para Planejamentos
          </Link>

          <Link
            href="/scan"
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
            Ir para Scan
          </Link>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="(opcional) buscar" style={input} />

          <select
            value={limit}
            onChange={(e) => {
              const v = Number(e.target.value);
              setLimit(v);
              setPage(1);
              void load(1);
            }}
            style={{ ...input, width: 120 } as any}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>

          <button
            onClick={() => void load(1)}
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
              Total: <b>{total}</b>
            </span>
            <span style={{ fontSize: 12, opacity: 0.85 }}>
              Página: <b>{page}</b>
            </span>
          </div>
        </div>

        {err && <div style={{ marginTop: 10, color: '#dc2626', fontWeight: 900 }}>{err}</div>}
      </div>

      <div style={{ ...card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Data</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Status</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Progresso</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>KM</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Frete</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>ID</th>
              <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                <td style={{ padding: 10, fontWeight: 800, whiteSpace: 'nowrap' }}>{fmtDate(r.dataRota || r.createdAt)}</td>
                <td style={{ padding: 10, fontWeight: 900 }}>{r.status}</td>
                <td style={{ padding: 10, fontWeight: 900 }}>
                  {r.entregues} / {r.totalParadas}
                </td>
                <td style={{ padding: 10 }}>{r.kmTotal == null ? '—' : Number(r.kmTotal).toFixed(1)}</td>
                <td style={{ padding: 10 }}>
                  {r.freteTotal == null
                    ? '—'
                    : Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.freteTotal)}
                </td>
                <td style={{ padding: 10 }}>
                  <code>{r.id}</code>
                </td>
                <td style={{ padding: 10 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link href={`/rotas/${encodeURIComponent(r.id)}`} style={{ ...btnMini, background: '#22c55e', color: '#fff', border: 'none' }}>
                      Abrir
                    </Link>
                    <Link href={`/scan?rotaId=${encodeURIComponent(r.id)}`} style={{ ...btnMini, background: '#38bdf8', color: '#fff', border: 'none' }}>
                      Scan
                    </Link>
                  </div>
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 16, opacity: 0.8 }}>
                  {loading ? 'Carregando…' : '(Sem rotas para exibir)'}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => {
              const p = Math.max(1, page - 1);
              setPage(p);
              void load(p);
            }}
            disabled={loading || page <= 1}
            style={{ ...btnMini, opacity: loading || page <= 1 ? 0.5 : 1 }}
          >
            ← Anterior
          </button>
          <button
            onClick={() => {
              const p = page + 1;
              setPage(p);
              void load(p);
            }}
            disabled={loading || !hasMore}
            style={{ ...btnMini, opacity: loading || !hasMore ? 0.5 : 1 }}
          >
            Próxima →
          </button>
        </div>
      </div>
    </div>
  );
}