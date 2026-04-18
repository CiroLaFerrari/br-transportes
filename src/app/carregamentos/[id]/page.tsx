'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

type MinutaVolume = {
  id: string;
  etiqueta: string;
  tipo: string;
  codigo: string;
  descricao: string;
  pesoKg?: number | null;
  alturaCm?: number | null;
  larguraCm?: number | null;
  comprimentoCm?: number | null;
  areaM2?: number | null;
  volumeM3?: number | null;
};

type MinutaItem = {
  id: string;
  produtoCode: string;
  produtoDescricao: string;
  quantidade: number;
  desmontavel: boolean;
  observacao?: string | null;
  volumes?: MinutaVolume[];
};

type Minuta = {
  id: string;
  numero?: string | null;
  nfNumero: string;
  cliente: string;
  cidade: string;
  uf: string;
  motorista?: string | null;
  dataColeta?: string | null;
  createdAt: string;
  updatedAt: string;
  itens?: MinutaItem[];
};

type ApiMinutaGet = {
  ok?: boolean;
  minuta?: Minuta;
  error?: string;
};

// status do checklist item (schema)
type ItemStatus = 'PENDENTE' | 'OK' | 'FALHA';

type ApiChecklistGet = {
  ok: boolean;
  checklist: any | null;
  itens: Array<{
    id: string;
    volumeId: string;
    etiqueta: string | null;
    status: ItemStatus;
    note: string | null;
    checkedAt: string | null;
  }>;
  error?: string;
};

function safeJson(res: Response) {
  return res.json().catch(() => null);
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return String(iso);
  }
}

function fmtDim(a?: number | null, b?: number | null, c?: number | null) {
  const A = a ?? '-';
  const B = b ?? '-';
  const C = c ?? '-';
  return `${A} x ${B} x ${C}`;
}

type StatusFilter = 'TODOS' | 'PENDENTES' | 'CONFERIDOS' | 'FALHA';

export default function CarregamentoChecklistPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const minutaId = String(params?.id || '').trim();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [minuta, setMinuta] = useState<Minuta | null>(null);

  // ✅ checklist no banco: volumeId -> status
  const [statusMap, setStatusMap] = useState<Record<string, ItemStatus>>({});
  const [filter, setFilter] = useState<StatusFilter>('TODOS');
  const [q, setQ] = useState('');

  // Checklist lock state
  const [checklistStatus, setChecklistStatus] = useState<'ABERTO' | 'FINALIZADO' | null>(null);
  const [checklistFinishedAt, setChecklistFinishedAt] = useState<string | null>(null);
  const [checklistConferente, setChecklistConferente] = useState<string | null>(null);
  const [conferenteInput, setConferenteInput] = useState('');
  const [finalizando, setFinalizando] = useState(false);

  const isLocked = checklistStatus === 'FINALIZADO';

  async function loadMinuta() {
    if (!minutaId) return;
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(`/api/minutas/${encodeURIComponent(minutaId)}`, { cache: 'no-store' });
      const j = (await safeJson(res)) as ApiMinutaGet | null;

      if (!res.ok || !j) throw new Error((j as any)?.error || 'Falha ao carregar minuta');
      if ((j as any)?.ok === false) throw new Error((j as any)?.error || 'Falha ao carregar minuta');

      const m = (j as any)?.minuta ? (j as any).minuta : (j as any);
      if (!m?.id) throw new Error('Resposta inválida ao carregar minuta');

      setMinuta(m as Minuta);
    } catch (e: any) {
      setErr(e?.message || 'Falha ao carregar minuta');
      setMinuta(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadChecklist() {
    if (!minutaId) return;

    try {
      const res = await fetch(`/api/minutas/${encodeURIComponent(minutaId)}/checklist`, { cache: 'no-store' });
      const j = (await safeJson(res)) as ApiChecklistGet | null;

      if (!res.ok || !j) throw new Error((j as any)?.error || 'Falha ao carregar checklist');
      if (!j.ok) throw new Error(j.error || 'Falha ao carregar checklist');

      const map: Record<string, ItemStatus> = {};
      for (const it of j.itens || []) {
        if (it?.volumeId) map[String(it.volumeId)] = it.status || 'OK';
      }
      setStatusMap(map);

      // Sync checklist lock state
      if (j.checklist) {
        setChecklistStatus(j.checklist.status || 'ABERTO');
        setChecklistFinishedAt(j.checklist.finishedAt || null);
        setChecklistConferente(j.checklist.conferente || null);
      } else {
        setChecklistStatus('ABERTO');
      }
    } catch (e: any) {
      // não trava a página se o checklist falhar
      console.warn('Checklist load error:', e?.message || e);
    }
  }

  useEffect(() => {
    void loadMinuta();
    void loadChecklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutaId]);

  const volumes = useMemo(() => {
    const its = minuta?.itens || [];
    const flat: MinutaVolume[] = [];
    for (const it of its) {
      const vols = it.volumes || [];
      for (const v of vols) flat.push(v);
    }
    return flat;
  }, [minuta]);

  const stats = useMemo(() => {
    const total = volumes.length;
    let ok = 0;
    let falha = 0;

    for (const v of volumes) {
      const st = statusMap[v.id] || 'PENDENTE';
      if (st === 'OK') ok += 1;
      if (st === 'FALHA') falha += 1;
    }

    const pend = total - ok - falha;
    const pct = total > 0 ? Math.round((ok / total) * 100) : 0;
    return { total, ok, pend, falha, pct };
  }, [volumes, statusMap]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();

    return volumes.filter((v) => {
      const st = statusMap[v.id] || 'PENDENTE';

      if (filter === 'PENDENTES' && st !== 'PENDENTE') return false;
      if (filter === 'CONFERIDOS' && st !== 'OK') return false;
      if (filter === 'FALHA' && st !== 'FALHA') return false;

      if (!term) return true;
      const hay = `${v.etiqueta} ${v.tipo} ${v.codigo} ${v.descricao}`.toLowerCase();
      return hay.includes(term);
    });
  }, [volumes, statusMap, filter, q]);

  async function setStatus(volumeId: string, st: ItemStatus) {
    if (isLocked) {
      setErr('Checklist finalizado. Peça ao administrador para reabrir antes de editar.');
      return;
    }

    // otimista na UI
    setStatusMap((prev) => ({ ...prev, [volumeId]: st }));

    try {
      const res = await fetch(`/api/minutas/${encodeURIComponent(minutaId)}/checklist/itens/${encodeURIComponent(volumeId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: st }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Falha ao salvar checklist');
    } catch (e: any) {
      // rollback
      setStatusMap((prev) => {
        const n = { ...prev };
        delete n[volumeId];
        return n;
      });
      setErr(e?.message || 'Falha ao salvar checklist');
    }
  }

  async function finalizarChecklist() {
    if (!confirm(`Finalizar checklist? Após finalizado, ninguém poderá alterar as marcações (exceto o administrador).`)) return;
    setFinalizando(true);
    setErr(null);
    try {
      const res = await fetch(`/api/minutas/${encodeURIComponent(minutaId)}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finalizar', conferente: conferenteInput.trim() || null }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Falha ao finalizar checklist');
      setChecklistStatus('FINALIZADO');
      setChecklistFinishedAt(j.checklist?.finishedAt || new Date().toISOString());
      setChecklistConferente(j.checklist?.conferente || conferenteInput.trim() || null);
      setSuccessMsg('Checklist finalizado com sucesso! Marcações bloqueadas.');
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (e: any) {
      setErr(e?.message || 'Falha ao finalizar checklist');
    } finally {
      setFinalizando(false);
    }
  }

  async function reabrirChecklist() {
    if (!confirm('Reabrir checklist? As marcações voltarão a ser editáveis.')) return;
    setErr(null);
    try {
      const res = await fetch(`/api/minutas/${encodeURIComponent(minutaId)}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reabrir' }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Falha ao reabrir checklist');
      setChecklistStatus('ABERTO');
      setChecklistFinishedAt(null);
      setSuccessMsg('Checklist reaberto. Pode editar novamente.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e: any) {
      setErr(e?.message || 'Falha ao reabrir checklist');
    }
  }

  function toggle(volumeId: string) {
    const cur = statusMap[volumeId] || 'PENDENTE';
    const next: ItemStatus = cur === 'OK' ? 'PENDENTE' : 'OK';
    void setStatus(volumeId, next);
  }

  async function marcarTodos(val: boolean) {
    // marca um por um (simples e confiável)
    for (const v of volumes) {
      const next: ItemStatus = val ? 'OK' : 'PENDENTE';
      // evita request desnecessário
      const cur = statusMap[v.id] || 'PENDENTE';
      if (cur === next) continue;
      // eslint-disable-next-line no-await-in-loop
      await setStatus(v.id, next);
    }
  }

  function abrirEtiquetasHTML() {
    window.open(`/api/minutas/${encodeURIComponent(minutaId)}/etiquetas`, '_blank');
  }

  function baixarCsv() {
    window.open(`/api/minutas/${encodeURIComponent(minutaId)}/etiquetas?format=csv`, '_blank');
  }

  const [scanInput, setScanInput] = useState('');
  const [scanMsg, setScanMsg] = useState('');

  function handleScan(code: string) {
    const etiq = code.trim();
    if (!etiq) return;

    // find volume by etiqueta
    const vol = volumes.find((v) => v.etiqueta === etiq);
    if (!vol) {
      setScanMsg(`Etiqueta "${etiq}" não encontrada nesta minuta.`);
      return;
    }

    const curSt = statusMap[vol.id] || 'PENDENTE';
    if (curSt === 'OK') {
      setScanMsg(`Etiqueta "${etiq}" já conferida.`);
    } else {
      void setStatus(vol.id, 'OK');
      setScanMsg(`Etiqueta "${etiq}" marcada como OK.`);
    }
    setScanInput('');
  }

  // ── Brand colours ──────────────────────────────
  const GREEN  = '#1A4A1A';
  const GOLD   = '#F5BE16';
  const LIGHT  = '#f0fdf4';   // very light green tint
  const BORDER = '#d1fae5';   // light green border

  const card: React.CSSProperties = {
    background: '#ffffff',
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    padding: 14,
    boxShadow: '0 1px 4px rgba(26,74,26,0.08)',
  };

  const btn: React.CSSProperties = {
    padding: '8px 14px',
    borderRadius: 8,
    border: 0,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 13,
  };

  const miniBtn: React.CSSProperties = {
    padding: '5px 11px',
    borderRadius: 999,
    border: 'none',
    background: '#e2e8f0',
    color: '#334155',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 12,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#64748b',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  };

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '10px 12px',
    background: GREEN,
    color: '#ffffff',
    fontWeight: 700,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: `2px solid ${GOLD}`,
    whiteSpace: 'nowrap',
  };

  if (!minutaId) {
    return (
      <div style={{ maxWidth: 1100, margin: '20px auto', padding: 16 }}>
        <div style={{ color: '#b91c1c', fontWeight: 800 }}>ID ausente na URL.</div>
        <button onClick={() => router.back()} style={{ ...btn, background: '#f1f5f9', color: '#fff', marginTop: 10 }}>
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '20px auto', padding: '20px 16px', background: '#f8fafc', minHeight: '100vh' }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <Link href="/minutas" style={{ color: GREEN, textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>
              ← Minutas
            </Link>
          </div>
          <h1 style={{ fontSize: 22, margin: 0, fontWeight: 900, color: GREEN }}>
            Checklist de Carregamento
          </h1>
          <div style={{ marginTop: 2, color: '#94a3b8', fontSize: 12 }}>
            Minuta: <code style={{ background: LIGHT, padding: '1px 6px', borderRadius: 4, color: GREEN, fontWeight: 700 }}>{minutaId}</code>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={abrirEtiquetasHTML}
            style={{ ...btn, background: GREEN, color: GOLD, border: `1px solid ${GREEN}` }}>
            🖨 Imprimir etiquetas
          </button>
          <button onClick={baixarCsv}
            style={{ ...btn, background: '#fff', color: GREEN, border: `1px solid ${BORDER}` }}>
            ⬇ Baixar CSV
          </button>
        </div>
      </div>

      {err && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: 8, color: '#b91c1c', fontWeight: 700, fontSize: 13 }}>
          {err}
          <button onClick={() => setErr(null)} style={{ marginLeft: 12, background: 'none', border: 'none',
            cursor: 'pointer', color: '#b91c1c', fontWeight: 900, fontSize: 14 }}>✕</button>
        </div>
      )}
      {successMsg && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #86efac',
          borderRadius: 8, color: '#166534', fontWeight: 700, fontSize: 13 }}>
          ✅ {successMsg}
        </div>
      )}
      {loading && <div style={{ marginTop: 10 }}>Carregando…</div>}

      {minuta && (
        <>
          {/* Info card */}
          <div style={{ ...card, marginTop: 14 }}>
            {/* NF / Cliente / etc. */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start',
              paddingBottom: 12, borderBottom: `1px solid ${BORDER}` }}>
              {[
                { label: 'NF', value: minuta.nfNumero },
                { label: 'Cliente', value: minuta.cliente },
                { label: 'Cidade / UF', value: `${minuta.cidade} / ${minuta.uf}` },
                { label: 'Motorista', value: minuta.motorista ?? '—' },
                { label: 'Data coleta', value: fmtDate(minuta.dataColeta) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={labelStyle}>{label}</div>
                  <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 14, marginTop: 1 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Stats + bulk actions */}
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Progress bar */}
              <div style={{ flex: '1 1 200px', minWidth: 200 }}>
                <div style={{ height: 8, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${stats.pct}%`,
                    background: stats.pct === 100 ? GREEN : stats.pct > 50 ? '#16a34a' : GOLD,
                    borderRadius: 999, transition: 'width 0.4s ease' }} />
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                  {stats.ok} / {stats.total} conferidos — {stats.pct}%
                </div>
              </div>

              <span style={{ padding: '3px 10px', borderRadius: 999, background: LIGHT, color: GREEN, fontWeight: 700, fontSize: 12, border: `1px solid ${BORDER}` }}>
                Total: {stats.total}
              </span>
              <span style={{ padding: '3px 10px', borderRadius: 999, background: '#dcfce7', color: '#166534', fontWeight: 700, fontSize: 12 }}>
                ✓ {stats.ok}
              </span>
              {stats.falha > 0 && (
                <span style={{ padding: '3px 10px', borderRadius: 999, background: '#fee2e2', color: '#991b1b', fontWeight: 700, fontSize: 12 }}>
                  ✗ {stats.falha}
                </span>
              )}
              {stats.pend > 0 && (
                <span style={{ padding: '3px 10px', borderRadius: 999, background: '#fef9c3', color: '#92400e', fontWeight: 700, fontSize: 12 }}>
                  ○ {stats.pend} pendentes
                </span>
              )}

              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => void marcarTodos(true)} disabled={isLocked}
                  style={{ ...btn, background: GREEN, color: '#fff', opacity: isLocked ? 0.35 : 1 }}>
                  ✓ Marcar todos
                </button>
                <button onClick={() => void marcarTodos(false)} disabled={isLocked}
                  style={{ ...btn, background: '#fff', color: '#dc2626', border: '1px solid #fecaca', opacity: isLocked ? 0.35 : 1 }}>
                  ✕ Desmarcar
                </button>
              </div>
            </div>

            {/* ── Finalizar / Locked Banner ───────────────────────── */}
            {isLocked ? (
              <div style={{ marginTop: 14, padding: '12px 16px',
                background: 'linear-gradient(135deg, #052e16 0%, #14532d 100%)',
                borderRadius: 10, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 22 }}>🔒</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900, color: '#86efac', fontSize: 15 }}>Checklist Finalizado</div>
                  <div style={{ fontSize: 12, color: '#4ade80', marginTop: 2 }}>
                    {checklistConferente && <>Conferido por: <b>{checklistConferente}</b> · </>}
                    {checklistFinishedAt && <>Em: <b>{fmtDate(checklistFinishedAt)}</b></>}
                  </div>
                  <div style={{ fontSize: 11, color: '#86efac', marginTop: 2, opacity: 0.8 }}>
                    Marcações bloqueadas. Somente o administrador pode reabrir.
                  </div>
                </div>
                <button onClick={() => void reabrirChecklist()}
                  style={{ ...btn, background: 'rgba(255,255,255,0.12)', color: '#fbbf24',
                    border: '1px solid rgba(251,191,36,0.4)', fontSize: 13 }}>
                  🔓 Reabrir (Admin)
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 14, padding: '12px 16px',
                background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0',
                display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>
                    Conferido por:
                  </div>
                  <input
                    value={conferenteInput}
                    onChange={(e) => setConferenteInput(e.target.value)}
                    placeholder="Seu nome (opcional)"
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1',
                      background: '#fff', color: '#1e293b', fontSize: 13, width: 200 }}
                  />
                </div>
                <button
                  onClick={() => void finalizarChecklist()}
                  disabled={finalizando}
                  style={{ ...btn, background: '#1A4A1A', color: '#F5BE16',
                    fontSize: 14, padding: '10px 20px', opacity: finalizando ? 0.7 : 1,
                    boxShadow: '0 2px 8px rgba(26,74,26,0.3)' }}>
                  {finalizando ? 'Salvando…' : '🔒 Finalizar e Salvar Checklist'}
                </button>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  Após finalizar, ninguém pode alterar as marcações.
                </div>
              </div>
            )}
          </div>

          {/* Scanner de etiquetas */}
          <div style={{ ...card, marginTop: 12,
            background: isLocked ? '#f8fafc' : LIGHT,
            border: `2px solid ${isLocked ? '#cbd5e1' : GREEN}`,
            opacity: isLocked ? 0.55 : 1 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 800, color: GREEN, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                📷 Leitura de Etiqueta (Scanner / QR)
              </div>
              <input
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleScan(scanInput); } }}
                placeholder="Escaneie ou digite a etiqueta e pressione Enter"
                autoFocus={!isLocked}
                disabled={isLocked}
                style={{ flex: 1, minWidth: 260, padding: '10px 14px', borderRadius: 8,
                  border: `2px solid ${GREEN}`, background: '#fff', color: '#1e293b',
                  fontSize: 15, fontFamily: 'ui-monospace, monospace', outline: 'none' }}
              />
              <button onClick={() => handleScan(scanInput)} disabled={isLocked}
                style={{ ...btn, background: GREEN, color: GOLD, padding: '10px 18px', fontSize: 14 }}>
                Conferir
              </button>
              <a href={`/scan?minutaId=${encodeURIComponent(minutaId)}`} target="_blank" rel="noopener"
                style={{ ...btn, background: '#fff', color: GREEN, border: `1px solid ${BORDER}`,
                  textDecoration: 'none', padding: '10px 16px', fontSize: 13 }}>
                Abrir câmera QR
              </a>
            </div>
            {scanMsg && (
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700,
                color: scanMsg.includes('OK') || scanMsg.includes('conferida') ? GREEN : '#d97706' }}>
                {scanMsg}
              </div>
            )}
          </div>

          <div style={{ ...card, marginTop: 12 }}>
            {/* Search / filter bar */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por etiqueta, código, descrição…"
                style={{ flex: 1, minWidth: 240, padding: '9px 12px', borderRadius: 8,
                  border: `1px solid ${BORDER}`, background: '#fff', color: '#1e293b',
                  fontSize: 13, outline: 'none' }}
              />
              <select value={filter} onChange={(e) => setFilter(e.target.value as any)}
                style={{ padding: '9px 12px', borderRadius: 8, border: `1px solid ${BORDER}`,
                  background: '#fff', color: GREEN, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                <option value="TODOS">Todos</option>
                <option value="PENDENTES">Pendentes</option>
                <option value="CONFERIDOS">Conferidos</option>
                <option value="FALHA">Falha</option>
              </select>
              <button onClick={() => { void loadMinuta(); void loadChecklist(); }}
                style={{ ...btn, background: '#fff', color: GREEN, border: `1px solid ${BORDER}` }}>
                ↺ Recarregar
              </button>
            </div>

            <div style={{ marginTop: 12, overflowX: 'auto', borderRadius: 8, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 52 }}>OK</th>
                    <th style={thStyle}>Etiqueta</th>
                    <th style={thStyle}>Tipo</th>
                    <th style={thStyle}>Código</th>
                    <th style={thStyle}>Descrição</th>
                    <th style={thStyle}>Dimensões (cm)</th>
                    <th style={thStyle}>Vol. (m³)</th>
                    <th style={thStyle}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((v, rowIdx) => {
                    const st = statusMap[v.id] || 'PENDENTE';
                    const checked = st === 'OK';

                    return (
                      <tr key={v.id} style={{ background: rowIdx % 2 === 0 ? '#ffffff' : LIGHT, color: '#1e293b' }}>
                        <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, textAlign: 'center' }}>
                          <input type="checkbox" checked={checked}
                            onChange={() => !isLocked && toggle(v.id)}
                            disabled={isLocked}
                            style={{ cursor: isLocked ? 'not-allowed' : 'pointer', accentColor: GREEN, width: 16, height: 16 }} />
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}` }}>
                          <code style={{ background: LIGHT, color: GREEN, padding: '2px 7px', borderRadius: 5,
                            fontSize: 11, fontWeight: 700, letterSpacing: '0.3px' }}>{v.etiqueta}</code>
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: '#475569', fontSize: 13 }}>{v.tipo}</td>
                        <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, fontFamily: 'monospace', fontSize: 12, color: '#334155' }}>{v.codigo}</td>
                        <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: '#1e293b', fontSize: 13 }}>{v.descricao}</td>
                        <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}` }}>
                          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#475569' }}>
                            {fmtDim(v.alturaCm ?? null, v.larguraCm ?? null, v.comprimentoCm ?? null)}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, fontFamily: 'monospace', fontSize: 12, color: '#475569' }}>
                          {v.volumeM3 != null ? Number(v.volumeM3).toFixed(4) : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}` }}>
                          {isLocked ? (
                            <span style={{
                              padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                              background: st === 'OK' ? '#dcfce7' : st === 'FALHA' ? '#fee2e2' : '#fef3c7',
                              color: st === 'OK' ? '#166534' : st === 'FALHA' ? '#991b1b' : '#92400e',
                            }}>
                              {st === 'OK' ? '✓ Conferido' : st === 'FALHA' ? '✗ Falha' : '○ Pendente'}
                            </span>
                          ) : (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button onClick={() => toggle(v.id)}
                                style={{ ...miniBtn, background: checked ? '#22c55e' : '#334155',
                                  color: checked ? '#0b1020' : '#e5e7eb', border: 'none' }}
                                title="Alternar conferência">
                                {checked ? 'Conferido' : 'Marcar'}
                              </button>
                              <button onClick={() => void setStatus(v.id, 'FALHA')}
                                style={{ ...miniBtn, background: st === 'FALHA' ? '#ef4444' : '#334155',
                                  color: st === 'FALHA' ? '#fff' : '#e5e7eb', border: 'none' }}
                                title="Marcar falha">
                                Falha
                              </button>
                              <button onClick={() => void setStatus(v.id, 'PENDENTE')}
                                style={{ ...miniBtn, background: st === 'PENDENTE' ? '#f59e0b' : '#334155',
                                  color: st === 'PENDENTE' ? '#0b1020' : '#e5e7eb', border: 'none' }}
                                title="Voltar para pendente">
                                Pendente
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: 20, color: '#94a3b8', textAlign: 'center', fontStyle: 'italic' }}>
                        Nenhum item encontrado com esse filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 10, color: '#94a3b8', fontSize: 11 }}>
              {isLocked
                ? '🔒 Checklist finalizado — marcações somente leitura'
                : 'Marque os itens conferidos. Clique em "Finalizar e Salvar" para bloquear o checklist.'}
            </div>
          </div>
        </>
      )}
    </div>
  );
}