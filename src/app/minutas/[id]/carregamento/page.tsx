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
    status: 'ABERTO' | 'FINALIZADO';
    conferente: string | null;
    startedAt: string;
    finishedAt: string | null;
    notes: string | null;
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
  const [observacao, setObservacao] = useState<string>('');

  const [savingMeta, setSavingMeta] = useState(false);
  const [savingMsg, setSavingMsg] = useState<string>('');

  const itens = resp?.itens || [];
  const isFinalizado = resp?.conferencia?.status === 'FINALIZADO';

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
      setObservacao(j.conferencia?.notes ?? '');
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
    if (isFinalizado) return;
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
    if (isFinalizado) return;
    try {
      setSavingMsg('');
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
          notes: observacao || null,
        }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.ok === false) throw new Error(j?.error || 'Falha ao salvar');

      setSavingMsg('Dados salvos.');
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Falha ao salvar');
    } finally {
      setSavingMeta(false);
    }
  }

  async function finalizarChecklist() {
    if (!confirm('Deseja finalizar o checklist? Após finalizar, não será mais possível editar.')) return;
    try {
      setSavingMeta(true);
      setSavingMsg('');
      setErr(null);

      // First save metadata
      await fetch(`/api/minutas/${encodeURIComponent(minutaId)}/carregamento`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conferente: conferente || null,
          notes: observacao || null,
        }),
      });

      // Then finalize
      const res = await fetch(`/api/minutas/${encodeURIComponent(minutaId)}/carregamento`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'FINALIZADO' }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.ok === false) throw new Error(j?.error || 'Falha ao finalizar');

      setSavingMsg('Checklist finalizado com sucesso.');
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Falha ao finalizar');
    } finally {
      setSavingMeta(false);
    }
  }

  async function reabrirChecklist() {
    if (!confirm('Deseja reabrir o checklist para edição?')) return;
    try {
      setSavingMeta(true);
      setSavingMsg('');
      setErr(null);

      const res = await fetch(`/api/minutas/${encodeURIComponent(minutaId)}/carregamento`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ABERTO' }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.ok === false) throw new Error(j?.error || 'Falha ao reabrir');

      setSavingMsg('Checklist reaberto.');
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Falha ao reabrir');
    } finally {
      setSavingMeta(false);
    }
  }

  async function marcarTodos(status: Item['status']) {
    if (isFinalizado) return;
    try {
      setSavingMsg('');
      for (const it of itens) {
        if (it.status !== status) {
          await fetch(`/api/minutas/${encodeURIComponent(minutaId)}/carregamento/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ etiqueta: it.etiqueta, status, checkedBy: checkedBy || null }),
          });
        }
      }
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Falha ao marcar todos');
    }
  }

  const card: React.CSSProperties = {
    marginTop: 12,
    padding: 14,
    borderRadius: 10,
    border: '1px solid #e2e8f0',
    background: '#ffffff',
  };

  const btn: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
  };

  const input: React.CSSProperties = {
    width: '100%',
    padding: 10,
    borderRadius: 8,
    border: '1px solid #d1d5db',
    background: '#ffffff',
    color: '#1e293b',
    outline: 'none',
  };

  const pct = summary.total > 0 ? Math.round((summary.ok / summary.total) * 100) : 0;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, color: '#1A4A1A' }}>Checklist de Carregamento</h1>
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
            MinutaId: <code>{minutaId}</code>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/minutas" style={{ ...btn, background: '#1A4A1A', color: '#fff', textDecoration: 'none' }}>
            Voltar (Minutas)
          </Link>
          <a
            href={`/api/minutas/${encodeURIComponent(minutaId)}/etiquetas`}
            target="_blank"
            rel="noreferrer"
            style={{ ...btn, background: '#7c3aed', color: '#fff', textDecoration: 'none' }}
          >
            Imprimir etiquetas
          </a>
          <a
            href={`/api/minutas/${encodeURIComponent(minutaId)}/csv`}
            target="_blank"
            rel="noreferrer"
            style={{ ...btn, background: '#0891b2', color: '#fff', textDecoration: 'none' }}
          >
            ⬇ Baixar Excel
          </a>
        </div>
      </div>

      {err && <div style={{ marginTop: 12, color: '#dc2626', fontWeight: 700, padding: '8px 12px', background: '#fef2f2', borderRadius: 8 }}>{err}</div>}
      {savingMsg && <div style={{ marginTop: 12, color: '#065f46', fontWeight: 700, padding: '8px 12px', background: '#d1fae5', borderRadius: 8 }}>{savingMsg}</div>}

      {/* Status Banner */}
      {isFinalizado && (
        <div style={{
          marginTop: 12,
          padding: '12px 16px',
          borderRadius: 8,
          background: '#dbeafe',
          border: '1px solid #93c5fd',
          color: '#1e40af',
          fontWeight: 700,
          fontSize: 14,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>Este checklist foi FINALIZADO em {fmtDate(resp?.conferencia?.finishedAt)} e não pode ser editado.</span>
          <button onClick={() => void reabrirChecklist()} disabled={savingMeta} style={{ ...btn, background: '#f59e0b', color: '#0f172a', fontSize: 12 }}>
            Reabrir para edição
          </button>
        </div>
      )}

      {/* Info card */}
      <div style={card}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>NF</div>
            <div style={{ fontWeight: 900, fontSize: 18, color: '#0f172a' }}>{resp?.minuta?.nfNumero ?? '-'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Cliente</div>
            <div style={{ fontWeight: 700, color: '#0f172a' }}>{resp?.minuta?.cliente ?? '-'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Cidade/UF</div>
            <div style={{ fontWeight: 700, color: '#0f172a' }}>{resp?.minuta ? `${resp.minuta.cidade}/${resp.minuta.uf}` : '-'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Conferente</div>
            <div style={{ fontWeight: 700, color: '#0f172a' }}>{resp?.conferencia?.conferente || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Data coleta</div>
            <div style={{ fontWeight: 700, color: '#0f172a' }}>{fmtDate(resp?.conferencia?.startedAt)}</div>
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, alignItems: 'center' }}>
          <span style={{ padding: '3px 10px', borderRadius: 999, background: '#f1f5f9', color: '#334155', fontWeight: 700 }}>Total: {summary.total}</span>
          <span style={{ padding: '3px 10px', borderRadius: 999, background: '#dcfce7', color: '#166534', fontWeight: 700 }}>Conferidos: {summary.ok}</span>
          <span style={{ padding: '3px 10px', borderRadius: 999, background: '#fee2e2', color: '#991b1b', fontWeight: 700 }}>Falha: {summary.falta + summary.avaria}</span>
          <span style={{ padding: '3px 10px', borderRadius: 999, background: '#e2e8f0', color: '#475569', fontWeight: 700 }}>Pendentes: {summary.pend}</span>
          <span style={{ padding: '3px 10px', borderRadius: 999, background: pct === 100 ? '#dcfce7' : '#fef3c7', color: pct === 100 ? '#166534' : '#92400e', fontWeight: 700 }}>{pct}%</span>

          {!isFinalizado && (
            <>
              <button onClick={() => void marcarTodos('OK')} style={{ ...btn, background: '#1A4A1A', color: '#fff', padding: '4px 12px', fontSize: 12 }}>
                Marcar todos
              </button>
              <button onClick={() => void marcarTodos('PENDENTE')} style={{ ...btn, background: '#ef4444', color: '#fff', padding: '4px 12px', fontSize: 12 }}>
                Desmarcar todos
              </button>
            </>
          )}
        </div>
      </div>

      {/* Scanner - only when open */}
      {!isFinalizado && (
        <div style={{ ...card, border: '2px solid #22c55e' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#166534', whiteSpace: 'nowrap' }}>Leitura de Etiqueta (Scanner / QR)</span>
            <input
              ref={scanRef}
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doScan('OK');
              }}
              style={{ ...input, flex: 1, minWidth: 200 }}
              placeholder="Escaneie ou digite a etiqueta e pressione Enter"
            />
            <button onClick={() => void doScan('OK')} style={{ ...btn, background: '#1A4A1A', color: '#fff' }}>
              Conferir
            </button>
          </div>
          {scan && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button onClick={() => void doScan('FALTA')} style={{ ...btn, background: '#ef4444', color: '#fff', fontSize: 12, padding: '6px 12px' }}>
                Marcar FALTA
              </button>
              <button onClick={() => void doScan('AVARIA')} style={{ ...btn, background: '#f59e0b', color: '#0f172a', fontSize: 12, padding: '6px 12px' }}>
                Marcar AVARIA
              </button>
            </div>
          )}
        </div>
      )}

      {/* Search and filter */}
      <div style={{ ...card, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          placeholder="Buscar por etiqueta, código, descrição..."
          style={{ ...input, flex: 1 }}
          onChange={(e) => {
            const q = e.target.value.toLowerCase();
            // Simple client-side filter could be added but for now just visual
          }}
        />
        <button onClick={() => void load()} disabled={loading} style={{ ...btn, background: '#1A4A1A', color: '#fff' }}>
          {loading ? 'Carregando...' : 'Recarregar'}
        </button>
      </div>

      {/* Items table */}
      <div style={{ ...card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: 12 }}>OK</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: 12 }}>Etiqueta</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: 12 }}>Status</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: 12 }}>Checado em</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: 12 }}>Obs</th>
              {!isFinalizado && (
                <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: 12 }}>Ação</th>
              )}
            </tr>
          </thead>
          <tbody>
            {itens.map((it) => {
              const b = badge(it.status);
              const isOk = it.status === 'OK';
              return (
                <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9', background: isOk ? '#f0fdf4' : undefined }}>
                  <td style={{ padding: '8px 10px' }}>
                    <input
                      type="checkbox"
                      checked={isOk}
                      disabled={isFinalizado}
                      onChange={() => {
                        if (!isFinalizado) void setItemStatus(it.id, it.etiqueta, isOk ? 'PENDENTE' : 'OK');
                      }}
                      style={{ width: 18, height: 18, cursor: isFinalizado ? 'default' : 'pointer' }}
                    />
                  </td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 12 }}>{it.etiqueta}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{
                      padding: '3px 10px',
                      borderRadius: 999,
                      background: b.bg,
                      color: b.fg,
                      fontWeight: 700,
                      fontSize: 11,
                    }}>
                      {b.label}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', color: '#64748b', fontSize: 12 }}>{it.checkedAt ? fmtDate(it.checkedAt) : '—'}</td>
                  <td style={{ padding: '8px 10px', color: '#64748b', fontSize: 12 }}>{it.note ?? '—'}</td>
                  {!isFinalizado && (
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {it.status !== 'OK' && (
                          <button onClick={() => void setItemStatus(it.id, it.etiqueta, 'OK')} style={{ ...btn, background: '#22c55e', color: '#fff', padding: '4px 10px', fontSize: 11 }}>
                            Conferido
                          </button>
                        )}
                        <button onClick={() => void setItemStatus(it.id, it.etiqueta, 'FALTA')} style={{ ...btn, background: it.status === 'FALTA' ? '#991b1b' : '#ef4444', color: '#fff', padding: '4px 10px', fontSize: 11 }}>
                          Falha
                        </button>
                        {it.status !== 'PENDENTE' && (
                          <button onClick={() => void setItemStatus(it.id, it.etiqueta, 'PENDENTE')} style={{ ...btn, background: '#64748b', color: '#fff', padding: '4px 10px', fontSize: 11 }}>
                            Pendente
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}

            {itens.length === 0 && (
              <tr>
                <td colSpan={isFinalizado ? 5 : 6} style={{ padding: 20, color: '#64748b', textAlign: 'center' }}>
                  {loading ? 'Carregando...' : '(Sem etiquetas/volumes na minuta)'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Metadata + Finalize section */}
      {!isFinalizado && (
        <div style={{ ...card, border: '2px solid #1A4A1A' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#1A4A1A' }}>Dados do carregamento</h2>

          <div style={{ marginTop: 10, display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Conferente</label>
              <input value={conferente} onChange={(e) => setConferente(e.target.value)} style={input} placeholder="Nome do conferente" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Observações</label>
              <input value={observacao} onChange={(e) => setObservacao(e.target.value)} style={input} placeholder="Observações (opcional)" />
            </div>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => void salvarMeta()} disabled={savingMeta} style={{ ...btn, background: '#2563eb', color: '#fff', opacity: savingMeta ? 0.7 : 1 }}>
              {savingMeta ? 'Salvando...' : 'Salvar dados'}
            </button>

            <button
              onClick={() => void finalizarChecklist()}
              disabled={savingMeta}
              style={{
                ...btn,
                background: '#1A4A1A',
                color: '#F5BE16',
                padding: '12px 24px',
                fontSize: 15,
                opacity: savingMeta ? 0.7 : 1,
              }}
            >
              Finalizar Checklist
            </button>

            <span style={{ fontSize: 12, color: '#64748b' }}>
              Após finalizar, o checklist não poderá ser editado.
            </span>
          </div>
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
        Checklist agora é persistido no banco (CarregamentoChecklist / CarregamentoChecklistItem).
      </div>
    </div>
  );
}
