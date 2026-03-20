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

  const [minuta, setMinuta] = useState<Minuta | null>(null);

  // ✅ checklist no banco: volumeId -> status
  const [statusMap, setStatusMap] = useState<Record<string, ItemStatus>>({});
  const [filter, setFilter] = useState<StatusFilter>('TODOS');
  const [q, setQ] = useState('');

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

  const card: React.CSSProperties = {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  };

  const btn: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 8,
    border: 0,
    cursor: 'pointer',
    fontWeight: 800,
  };

  const miniBtn: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid #d1d5db',
    background: '#f1f5f9',
    color: '#1e293b',
    cursor: 'pointer',
    fontWeight: 900,
    fontSize: 12,
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
    <div style={{ maxWidth: 1200, margin: '20px auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Checklist de Carregamento</h1>
          <div style={{ marginTop: 4, color: '#64748b', fontSize: 13 }}>
            MinutaId: <code>{minutaId}</code>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/minutas" style={{ ...btn, background: '#f1f5f9', color: '#fff', textDecoration: 'none' }}>
            Voltar (Minutas)
          </Link>

          <button onClick={abrirEtiquetasHTML} style={{ ...btn, background: '#0ea5e9', color: '#1e293b' }}>
            Imprimir etiquetas
          </button>

          <button onClick={baixarCsv} style={{ ...btn, background: '#22c55e', color: '#1e293b' }}>
            Baixar CSV
          </button>
        </div>
      </div>

      {err && <div style={{ marginTop: 10, color: '#b91c1c', fontWeight: 800 }}>{err}</div>}
      {loading && <div style={{ marginTop: 10 }}>Carregando…</div>}

      {minuta && (
        <>
          <div style={{ ...card, marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, color: '#64748b' }}>NF</div>
                <div style={{ fontWeight: 900, color: '#1e293b' }}>{minuta.nfNumero}</div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Cliente</div>
                <div style={{ fontWeight: 900, color: '#1e293b' }}>{minuta.cliente}</div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Cidade/UF</div>
                <div style={{ fontWeight: 900, color: '#1e293b' }}>
                  {minuta.cidade}/{minuta.uf}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Motorista</div>
                <div style={{ fontWeight: 900, color: '#1e293b' }}>{minuta.motorista ?? '—'}</div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Data coleta</div>
                <div style={{ fontWeight: 900, color: '#1e293b' }}>{fmtDate(minuta.dataColeta)}</div>
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ padding: '2px 10px', borderRadius: 999, background: '#e2e8f0', color: '#0f172a', fontWeight: 900, fontSize: 12 }}>
                Total: {stats.total}
              </span>
              <span style={{ padding: '2px 10px', borderRadius: 999, background: '#dcfce7', color: '#166534', fontWeight: 900, fontSize: 12 }}>
                Conferidos: {stats.ok}
              </span>
              <span style={{ padding: '2px 10px', borderRadius: 999, background: '#fee2e2', color: '#991b1b', fontWeight: 900, fontSize: 12 }}>
                Falha: {stats.falha}
              </span>
              <span style={{ padding: '2px 10px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontWeight: 900, fontSize: 12 }}>
                Pendentes: {stats.pend}
              </span>
              <span style={{ padding: '2px 10px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontWeight: 900, fontSize: 12 }}>
                {stats.pct}%
              </span>

              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => void marcarTodos(true)} style={{ ...btn, background: '#10b981', color: '#1e293b' }}>
                  Marcar todos
                </button>
                <button onClick={() => void marcarTodos(false)} style={{ ...btn, background: '#ef4444', color: '#fff' }}>
                  Desmarcar todos
                </button>
              </div>
            </div>
          </div>

          {/* Scanner de etiquetas */}
          <div style={{ ...card, marginTop: 12, background: '#f0fdf4', border: '2px solid #22c55e' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 900, color: '#22c55e', fontSize: 14 }}>Leitura de Etiqueta (Scanner / QR)</div>
              <input
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleScan(scanInput);
                  }
                }}
                placeholder="Escaneie ou digite a etiqueta e pressione Enter"
                autoFocus
                style={{
                  flex: 1,
                  minWidth: 280,
                  padding: 12,
                  borderRadius: 8,
                  border: '2px solid #22c55e',
                  background: '#ffffff',
                  color: '#1e293b',
                  fontSize: 16,
                  fontFamily: 'ui-monospace, monospace',
                }}
              />
              <button
                onClick={() => handleScan(scanInput)}
                style={{ ...btn, background: '#22c55e', color: '#1e293b', padding: '12px 16px', fontSize: 14 }}
              >
                Conferir
              </button>
              <a
                href={`/scan?minutaId=${encodeURIComponent(minutaId)}`}
                target="_blank"
                rel="noopener"
                style={{ ...btn, background: '#6366f1', color: '#fff', textDecoration: 'none', padding: '12px 16px', fontSize: 14 }}
              >
                Abrir câmera QR
              </a>
            </div>
            {scanMsg && (
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: scanMsg.includes('OK') || scanMsg.includes('conferida') ? '#22c55e' : '#f59e0b' }}>
                {scanMsg}
              </div>
            )}
          </div>

          <div style={{ ...card, marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por etiqueta, código, descrição…"
                style={{
                  flex: 1,
                  minWidth: 260,
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  color: '#1e293b',
                }}
              />

              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  color: '#1e293b',
                  fontWeight: 800,
                }}
              >
                <option value="TODOS">Todos</option>
                <option value="PENDENTES">Pendentes</option>
                <option value="CONFERIDOS">Conferidos</option>
                <option value="FALHA">Falha</option>
              </select>

              <button onClick={() => { void loadMinuta(); void loadChecklist(); }} style={{ ...btn, background: '#0ea5e9', color: '#1e293b' }}>
                Recarregar
              </button>
            </div>

            <div style={{ marginTop: 12, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#0b1220', color: '#64748b' }}>
                    <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #e2e8f0', width: 70 }}>OK</th>
                    <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #e2e8f0' }}>Etiqueta</th>
                    <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #e2e8f0' }}>Tipo</th>
                    <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #e2e8f0' }}>Código</th>
                    <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #e2e8f0' }}>Descrição</th>
                    <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #e2e8f0' }}>Dimensões (cm)</th>
                    <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #e2e8f0' }}>Volume (m³)</th>
                    <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #e2e8f0' }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((v) => {
                    const st = statusMap[v.id] || 'PENDENTE';
                    const checked = st === 'OK';

                    return (
                      <tr key={v.id} style={{ background: '#ffffff', color: '#1e293b' }}>
                        <td style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>
                          <input type="checkbox" checked={checked} onChange={() => toggle(v.id)} />
                        </td>
                        <td style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>
                          <code>{v.etiqueta}</code>
                        </td>
                        <td style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>{v.tipo}</td>
                        <td style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>{v.codigo}</td>
                        <td style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>{v.descricao}</td>
                        <td style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>
                          <span style={{ fontFamily: 'ui-monospace, monospace' }}>{fmtDim(v.alturaCm ?? null, v.larguraCm ?? null, v.comprimentoCm ?? null)}</span>
                        </td>
                        <td style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>{v.volumeM3 != null ? Number(v.volumeM3).toFixed(4) : '—'}</td>
                        <td style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              onClick={() => toggle(v.id)}
                              style={{
                                ...miniBtn,
                                background: checked ? '#22c55e' : '#334155',
                                color: checked ? '#0b1020' : '#e5e7eb',
                                border: 'none',
                              }}
                              title="Alternar conferência"
                            >
                              {checked ? 'Conferido' : 'Marcar'}
                            </button>

                            <button
                              onClick={() => void setStatus(v.id, 'FALHA')}
                              style={{
                                ...miniBtn,
                                background: st === 'FALHA' ? '#ef4444' : '#334155',
                                color: st === 'FALHA' ? '#fff' : '#e5e7eb',
                                border: 'none',
                              }}
                              title="Marcar falha"
                            >
                              Falha
                            </button>

                            <button
                              onClick={() => void setStatus(v.id, 'PENDENTE')}
                              style={{
                                ...miniBtn,
                                background: st === 'PENDENTE' ? '#f59e0b' : '#334155',
                                color: st === 'PENDENTE' ? '#0b1020' : '#e5e7eb',
                                border: 'none',
                              }}
                              title="Voltar para pendente"
                            >
                              Pendente
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: 14, color: '#64748b' }}>
                        (Nada para mostrar com esse filtro)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 10, color: '#64748b', fontSize: 12 }}>
              Checklist agora é persistido no banco (CarregamentoChecklist / CarregamentoChecklistItem).
            </div>
          </div>
        </>
      )}
    </div>
  );
}