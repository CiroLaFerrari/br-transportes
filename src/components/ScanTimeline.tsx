'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type TimelineItem = {
  id: string;
  createdAt: string;
  status: string;
  note: string | null;
  etiqueta: string;
  type: 'PARADA' | 'COLETA' | 'OUTRO';
  paradaId: string | null;
  coletaId: string | null;
  paradaLabel: string | null;
  paradaOrdem: number | null;
  nf: string | null;
  href: string | null;
};

type ApiResp = {
  ok: boolean;
  rota?: { id: string; dataRota: string; status: string };
  limit?: number;
  timeline?: TimelineItem[];
  error?: string;
};

function fmt(iso?: string | null) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${mi}`;
  } catch {
    return String(iso);
  }
}

export default function ScanTimeline({ rotaId }: { rotaId: string | null }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<TimelineItem[]>([]);

  async function load() {
    if (!rotaId) {
      setItems([]);
      setErr(null);
      return;
    }

    try {
      setLoading(true);
      setErr(null);

      const res = await fetch(`/api/scan/timeline?rotaId=${encodeURIComponent(rotaId)}&limit=60`, { cache: 'no-store' });
      const j = (await res.json().catch(() => null)) as ApiResp | null;

      if (!res.ok || !j || !j.ok) throw new Error(j?.error || 'Falha ao carregar timeline');
      setItems(Array.isArray(j.timeline) ? j.timeline : []);
    } catch (e: any) {
      setErr(e?.message || 'Falha ao carregar timeline');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotaId]);

  const last = useMemo(() => (items.length ? items[0] : null), [items]);

  const card: React.CSSProperties = {
    border: '1px solid rgba(148,163,184,0.25)',
    background: 'rgba(15,23,42,0.35)',
    borderRadius: 10,
    padding: 12,
  };

  const btnMini: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 8,
    border: 'none',
    background: '#334155',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 900,
    fontSize: 12,
    opacity: loading ? 0.7 : 1,
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Timeline</div>
          <div style={{ fontWeight: 900 }}>
            {rotaId ? (loading ? 'Carregando…' : `${items.length} evento(s)`) : 'Sem rotaId'}
          </div>

          {last && (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
              <strong>Último:</strong> {fmt(last.createdAt)} • <code>{last.status}</code>
              {last.nf ? ` • NF ${last.nf}` : ''}
              {last.paradaOrdem != null ? ` • Parada ${last.paradaOrdem}` : ''}
              {last.paradaLabel ? ` • ${last.paradaLabel}` : ''}
            </div>
          )}
        </div>

        <button onClick={() => void load()} style={btnMini} disabled={loading || !rotaId}>
          {loading ? 'Recarregando…' : 'Recarregar'}
        </button>
      </div>

      {err && <div style={{ marginTop: 10, color: '#fca5a5', fontWeight: 900 }}>{err}</div>}

      {items.length === 0 ? (
        <div style={{ marginTop: 10, opacity: 0.8 }}>(Sem eventos)</div>
      ) : (
        <div style={{ marginTop: 10, maxHeight: 340, overflowY: 'auto', borderTop: '1px solid rgba(148,163,184,0.18)' }}>
          {items.map((it) => (
            <div key={it.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontWeight: 900 }}>
                  {fmt(it.createdAt)} • <code>{it.status}</code>
                </div>

                {it.href ? (
                  <Link href={it.href} style={{ color: '#93c5fd', textDecoration: 'underline', fontSize: 12, fontWeight: 800 }}>
                    Abrir
                  </Link>
                ) : (
                  <span style={{ fontSize: 12, opacity: 0.6 }}>—</span>
                )}
              </div>

              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
                {it.nf ? <span><strong>NF:</strong> {it.nf} • </span> : null}
                {it.paradaOrdem != null ? <span><strong>Parada:</strong> {it.paradaOrdem} • </span> : null}
                {it.paradaLabel ? <span><strong>Local:</strong> {it.paradaLabel} • </span> : null}
                <span style={{ opacity: 0.85 }}><code>{it.etiqueta}</code></span>
              </div>

              {it.note ? <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>{it.note}</div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
