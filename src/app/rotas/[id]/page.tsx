'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import LeafletMap from '@/components/LeafletMap';

type StatusExec = 'PENDENTE' | 'EM_ATENDIMENTO' | 'ENTREGUE' | 'FALHA';
type ColetaStatus = 'EM_PATIO' | 'CARREGADA' | 'EM_TRANSITO' | 'ENTREGUE';

type RotaParada = {
  id: string;
  ordem: number;
  label: string;
  lat: number;
  lon: number;
  statusExec: StatusExec;
  checkinAt: string | null;
  checkoutAt: string | null;
  coletaId: string;
  // POD
  recebedorNome?: string | null;
  recebedorDoc?: string | null;
  obsEntrega?: string | null;
  Coleta?: {
    id: string;
    nf: string;
    cidade: string;
    uf: string;

    // status da coleta (fluxo do pátio/entregas)
    status?: ColetaStatus;

    entradaPatioAt?: string | null;
    embarqueAt?: string | null;
    fimPatioAt?: string | null;

    leadPatioDias?: number | null;
    patioAberto?: boolean;
    patioFimAt?: string | null;

    Cliente?: { razao: string } | null;
  } | null;
};

type RotaDetalheResp = {
  ok: boolean;
  rota?: {
    id: string;
    dataRota: string;
    status: string;
    totalParadas?: number;
    entregues?: number;
    paradas?: RotaParada[];
  };
  error?: string;
};

type ScanEventRow = {
  id: string;
  etiqueta: string;
  status: string;
  note: string | null;
  createdAt: string;
};

type RotaEventosResp = {
  ok: boolean;
  rota?: { id: string; dataRota: string; status: string };
  totalColetas?: number;
  limit?: number;
  eventos?: ScanEventRow[];
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

function fmtDias(n?: number | null, aberto?: boolean) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const v = n.toFixed(2);
  return aberto ? `${v} (aberto)` : v;
}

async function safeJson(res: Response) {
  return await res.json().catch(() => null);
}

function badgeForStatusExec(s: StatusExec) {
  if (s === 'ENTREGUE') return { bg: '#dcfce7', color: '#166534', label: 'ENTREGUE' };
  if (s === 'EM_ATENDIMENTO') return { bg: '#fef3c7', color: '#92400e', label: 'EM ATENDIMENTO' };
  if (s === 'FALHA') return { bg: '#fee2e2', color: '#991b1b', label: 'FALHA' };
  return { bg: '#e2e8f0', color: '#0f172a', label: 'PENDENTE' };
}

function badgeForColetaStatus(s?: ColetaStatus) {
  if (s === 'ENTREGUE') return { bg: '#dcfce7', color: '#166534', label: 'COLETA: ENTREGUE' };
  if (s === 'EM_TRANSITO') return { bg: '#dbeafe', color: '#1d4ed8', label: 'COLETA: EM TRÂNSITO' };
  if (s === 'CARREGADA') return { bg: '#fef3c7', color: '#92400e', label: 'COLETA: CARREGADA' };
  return { bg: '#e2e8f0', color: '#0f172a', label: `COLETA: ${s || '—'}` };
}

export default function RotaDetalhePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const rotaId = (params?.id || '').toString();

  const [rota, setRota] = useState<RotaDetalheResp['rota'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [acaoMsg, setAcaoMsg] = useState<string | null>(null);
  const [savingColetaId, setSavingColetaId] = useState<string | null>(null);

  const [eventos, setEventos] = useState<ScanEventRow[]>([]);
  const [eventosErr, setEventosErr] = useState<string | null>(null);
  const [loadingEventos, setLoadingEventos] = useState(false);

  // POD (comprovante de entrega)
  const [podParadaId, setPodParadaId] = useState<string | null>(null);
  const [podNome, setPodNome] = useState('');
  const [podDoc, setPodDoc] = useState('');
  const [podObs, setPodObs] = useState('');
  const [podSaving, setPodSaving] = useState(false);

  async function load() {
    if (!rotaId) return;

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/rotas/${encodeURIComponent(rotaId)}`, { cache: 'no-store' });
      const j = (await safeJson(res)) as RotaDetalheResp | null;

      if (!res.ok || !j || !j.ok || !j.rota) {
        const msg = (j as any)?.error || 'Falha ao carregar rota';
        setError(msg);
        setRota(null);
        return;
      }

      const paradas = [...(j.rota.paradas || [])].sort((a, b) => a.ordem - b.ordem);
      setRota({ ...j.rota, paradas });
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar rota');
      setRota(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadEventos() {
    if (!rotaId) return;
    try {
      setLoadingEventos(true);
      setEventosErr(null);

      const res = await fetch(`/api/rotas/${encodeURIComponent(rotaId)}/eventos?limit=200`, { cache: 'no-store' });
      const j = (await safeJson(res)) as RotaEventosResp | null;

      if (!res.ok || !j || !j.ok) {
        throw new Error((j as any)?.error || 'Falha ao carregar auditoria da rota');
      }

      setEventos(Array.isArray(j.eventos) ? j.eventos : []);
    } catch (e: any) {
      setEventosErr(e?.message || 'Falha ao carregar auditoria da rota');
      setEventos([]);
    } finally {
      setLoadingEventos(false);
    }
  }

  useEffect(() => {
    if (!rotaId) return;
    void load();
    void loadEventos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotaId]);

  const progresso = useMemo(() => {
    const total = rota?.paradas?.length ?? rota?.totalParadas ?? 0;
    const entregues =
      rota?.entregues ??
      (rota?.paradas ? rota.paradas.filter((p) => p.statusExec === 'ENTREGUE').length : 0);
    return { total, entregues };
  }, [rota]);

  const mapPoints = useMemo(() => {
    const ps = (rota?.paradas || [])
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .filter(
        (p) => typeof p.lon === 'number' && typeof p.lat === 'number' && Number.isFinite(p.lon) && Number.isFinite(p.lat),
      )
      .map((p) => ({ label: `${p.ordem}. ${p.label}`, coord: [p.lon, p.lat] as [number, number] }));

    return ps;
  }, [rota]);

  const mapLines = useMemo(() => {
    if (mapPoints.length < 2) return [];
    return [{ type: 'LineString', coordinates: mapPoints.map((p) => [p.coord[0], p.coord[1]]) }];
  }, [mapPoints]);

  const page: React.CSSProperties = {
    padding: 16,
    minHeight: '100vh',
    background: '#0b1220',
    color: '#e5e7eb',
  };

  const btn: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 900,
  };

  const card: React.CSSProperties = {
    marginTop: 12,
    padding: 14,
    borderRadius: 10,
    border: '1px solid rgba(148,163,184,0.25)',
    background: 'rgba(15,23,42,0.35)',
  };

  const btnMini: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid rgba(148,163,184,0.25)',
    background: '#1A4A1A',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 900,
    fontSize: 12,
  };

  async function declararSaidaPatioPorRota(coletaId: string, paradaId: string, nf: string) {
    if (!coletaId) return;

    const ok = confirm(
      `Declarar saída do pátio para a coleta ${nf || coletaId}?\n\nObs: se já saiu, a ação deve apenas confirmar (sem duplicar).`,
    );
    if (!ok) return;

    try {
      setAcaoMsg(null);
      setSavingColetaId(coletaId);

      const res = await fetch(`/api/coletas/${encodeURIComponent(coletaId)}/acao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SAIDA_PATIO',
          note: `Saída do pátio declarada via rota ${rotaId} (parada ${paradaId})`,
        }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.ok === false) throw new Error(j?.error || 'Falha ao declarar saída do pátio');

      setAcaoMsg(`OK: saída do pátio registrada/confirmada para ${nf || coletaId}.`);
      void load();
      void loadEventos();
    } catch (e: any) {
      setAcaoMsg(e?.message || 'Falha ao declarar saída do pátio');
    } finally {
      setSavingColetaId(null);
    }
  }

  function openPodForm(paradaId: string) {
    setPodParadaId(paradaId);
    // Pre-fill if POD already exists
    const parada = rota?.paradas?.find((p) => p.id === paradaId);
    setPodNome(parada?.recebedorNome || '');
    setPodDoc(parada?.recebedorDoc || '');
    setPodObs(parada?.obsEntrega || '');
  }

  async function finalizarComPod() {
    if (!podParadaId) return;
    try {
      setPodSaving(true);
      setAcaoMsg(null);

      const res = await fetch(`/api/paradas/${encodeURIComponent(podParadaId)}/exec`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'FINALIZAR',
          recebedorNome: podNome.trim() || undefined,
          recebedorDoc: podDoc.trim() || undefined,
          obsEntrega: podObs.trim() || undefined,
        }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Falha ao finalizar parada');

      setAcaoMsg(`OK: Parada finalizada com comprovante de entrega.`);
      setPodParadaId(null);
      setPodNome('');
      setPodDoc('');
      setPodObs('');
      void load();
      void loadEventos();
    } catch (e: any) {
      setAcaoMsg(e?.message || 'Falha ao finalizar');
    } finally {
      setPodSaving(false);
    }
  }

  async function executarAcaoParada(paradaId: string, action: 'CHECKIN' | 'FALHA', obsStatus?: string) {
    try {
      setAcaoMsg(null);
      setSavingColetaId(paradaId);

      const res = await fetch(`/api/paradas/${encodeURIComponent(paradaId)}/exec`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, obsStatus }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || `Falha ao executar ${action}`);

      setAcaoMsg(`OK: ${action} registrado.`);
      void load();
      void loadEventos();
    } catch (e: any) {
      setAcaoMsg(e?.message || `Falha ao executar ação`);
    } finally {
      setSavingColetaId(null);
    }
  }

  if (!rotaId) {
    return (
      <div style={page}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>Rota</h1>
        <div style={{ marginTop: 10, color: '#fca5a5', fontWeight: 900 }}>rotaId ausente na URL.</div>
        <button onClick={() => router.back()} style={{ ...btn, background: '#1f2937', color: '#fff', marginTop: 12 }}>
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Rota</h1>
          <div style={{ color: '#93c5fd', fontSize: 12, marginTop: 4 }}>{rotaId}</div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={() => router.back()} style={{ ...btn, background: '#1f2937', color: '#fff' }}>
            Voltar
          </button>

          <Link
            href={`/scan?rotaId=${encodeURIComponent(rotaId)}`}
            style={{
              ...btn,
              background: '#38bdf8',
              color: '#0b1220',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Ir para Scan
          </Link>

          <button
            onClick={() => {
              void load();
              void loadEventos();
            }}
            disabled={loading || loadingEventos}
            style={{
              ...btn,
              background: '#1A4A1A',
              color: '#fff',
              opacity: loading || loadingEventos ? 0.6 : 1,
            }}
          >
            {loading || loadingEventos ? 'Recarregando…' : 'Recarregar'}
          </button>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Data</div>
            <div style={{ fontWeight: 900 }}>{rota?.dataRota ? fmtDate(rota.dataRota) : '-'}</div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Status</div>
            <div style={{ fontWeight: 900 }}>{rota?.status ?? '-'}</div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Progresso (paradas)</div>
            <div style={{ fontWeight: 900 }}>
              {progresso.entregues} / {progresso.total}
            </div>
          </div>
        </div>

        {error && <div style={{ marginTop: 10, color: '#fca5a5', fontWeight: 900 }}>{error}</div>}

        {acaoMsg && (
          <div style={{ marginTop: 10, color: acaoMsg.startsWith('OK:') ? '#86efac' : '#fca5a5', fontWeight: 900 }}>
            {acaoMsg}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Auditoria (Eventos)</div>
            <div style={{ fontWeight: 900 }}>{loadingEventos ? 'Carregando…' : `${eventos.length} evento(s)`}</div>
          </div>

          <button
            onClick={() => void loadEventos()}
            disabled={loadingEventos}
            style={{
              ...btnMini,
              background: loadingEventos ? '#0f1720' : '#334155',
              border: 'none',
              color: '#fff',
              opacity: loadingEventos ? 0.7 : 1,
            }}
          >
            {loadingEventos ? 'Recarregando…' : 'Recarregar auditoria'}
          </button>
        </div>

        {eventosErr && <div style={{ marginTop: 10, color: '#fca5a5', fontWeight: 900 }}>{eventosErr}</div>}

        {eventos.length === 0 ? (
          <div style={{ marginTop: 10, opacity: 0.8 }}>(Sem eventos)</div>
        ) : (
          <div style={{ marginTop: 10, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(2,6,23,0.45)' }}>
                  <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Data</th>
                  <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Status</th>
                  <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Note</th>
                  <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Etiqueta</th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((ev) => (
                  <tr key={ev.id} style={{ borderTop: '1px solid rgba(148,163,184,0.18)' }}>
                    <td style={{ padding: 10, fontWeight: 800, whiteSpace: 'nowrap' }}>{fmtDate(ev.createdAt)}</td>
                    <td style={{ padding: 10 }}>
                      <code>{ev.status}</code>
                    </td>
                    <td style={{ padding: 10 }}>{ev.note ? ev.note : <span style={{ opacity: 0.7 }}>—</span>}</td>
                    <td style={{ padding: 10 }}>
                      <code>{ev.etiqueta}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 12,
          borderRadius: 10,
          border: '1px solid rgba(148,163,184,0.25)',
          background: 'rgba(15,23,42,0.35)',
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(2,6,23,0.45)' }}>
              <th style={{ textAlign: 'left', padding: 12, fontSize: 12, opacity: 0.9 }}>Ordem</th>
              <th style={{ textAlign: 'left', padding: 12, fontSize: 12, opacity: 0.9 }}>Parada</th>
              <th style={{ textAlign: 'left', padding: 12, fontSize: 12, opacity: 0.9 }}>NF / Cliente</th>
              <th style={{ textAlign: 'left', padding: 12, fontSize: 12, opacity: 0.9 }}>Pátio (dias)</th>
              <th style={{ textAlign: 'left', padding: 12, fontSize: 12, opacity: 0.9 }}>Status</th>
              <th style={{ textAlign: 'left', padding: 12, fontSize: 12, opacity: 0.9 }}>Check-in</th>
              <th style={{ textAlign: 'left', padding: 12, fontSize: 12, opacity: 0.9 }}>Check-out</th>
              <th style={{ textAlign: 'left', padding: 12, fontSize: 12, opacity: 0.9 }}>Comprovante (POD)</th>
              <th style={{ textAlign: 'left', padding: 12, fontSize: 12, opacity: 0.9 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {(rota?.paradas || []).map((p) => {
              const bParada = badgeForStatusExec(p.statusExec);
              const bColeta = badgeForColetaStatus(p.Coleta?.status);

              const nf = p.Coleta?.nf ?? '-';
              const cliente = p.Coleta?.Cliente?.razao ?? '-';
              const cidadeUf = p.Coleta ? `${p.Coleta.cidade} / ${p.Coleta.uf}` : '-';

              const busy = savingColetaId === p.coletaId;

              const lead = p.Coleta?.leadPatioDias ?? null;
              const aberto = !!p.Coleta?.patioAberto;

              const saidaJaDeclarada = !!p.Coleta?.fimPatioAt;

              return (
                <tr key={p.id} style={{ borderTop: '1px solid rgba(148,163,184,0.18)' }}>
                  <td style={{ padding: 12, fontWeight: 900 }}>{p.ordem}</td>

                  <td style={{ padding: 12 }}>
                    <div style={{ fontWeight: 900 }}>{p.label}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      {Number(p.lat).toFixed(6)}, {Number(p.lon).toFixed(6)}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>
                      Parada ID: <code>{p.id}</code>
                    </div>
                  </td>

                  <td style={{ padding: 12 }}>
                    <div style={{ fontWeight: 900 }}>{nf}</div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>{cliente}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>{cidadeUf}</div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>
                      Coleta ID: <code>{p.coletaId}</code>
                    </div>
                  </td>

                  <td style={{ padding: 12, fontWeight: 900 }}>{fmtDias(lead, aberto)}</td>

                  <td style={{ padding: 12 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          padding: '4px 10px',
                          borderRadius: 999,
                          background: bParada.bg,
                          color: bParada.color,
                          fontWeight: 900,
                          fontSize: 12,
                        }}
                        title="Status da parada (execução)"
                      >
                        {bParada.label}
                      </span>

                      <span
                        style={{
                          display: 'inline-flex',
                          padding: '4px 10px',
                          borderRadius: 999,
                          background: bColeta.bg,
                          color: bColeta.color,
                          fontWeight: 900,
                          fontSize: 12,
                        }}
                        title="Status da coleta (pátio/entregas)"
                      >
                        {bColeta.label}
                      </span>
                    </div>
                  </td>

                  <td style={{ padding: 12, fontWeight: 800 }}>{p.checkinAt ? fmtDate(p.checkinAt) : '—'}</td>
                  <td style={{ padding: 12, fontWeight: 800 }}>{p.checkoutAt ? fmtDate(p.checkoutAt) : '—'}</td>

                  {/* POD column */}
                  <td style={{ padding: 12 }}>
                    {p.recebedorNome ? (
                      <div style={{ fontSize: 12 }}>
                        <div><b>{p.recebedorNome}</b></div>
                        {p.recebedorDoc && <div style={{ opacity: 0.8 }}>Doc: {p.recebedorDoc}</div>}
                        {p.obsEntrega && <div style={{ opacity: 0.8, fontStyle: 'italic' }}>{p.obsEntrega}</div>}
                      </div>
                    ) : p.statusExec === 'ENTREGUE' ? (
                      <span style={{ fontSize: 11, opacity: 0.6 }}>Sem comprovante</span>
                    ) : (
                      <span style={{ fontSize: 11, opacity: 0.5 }}>—</span>
                    )}
                  </td>

                  {/* Actions column */}
                  <td style={{ padding: 12 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {/* Saída do pátio */}
                      {!saidaJaDeclarada && (
                        <button
                          style={{
                            ...btnMini,
                            background: busy ? '#0f1720' : '#22c55e',
                            color: busy ? '#94a3b8' : '#0b1220',
                            border: 'none',
                          }}
                          disabled={busy}
                          onClick={() => void declararSaidaPatioPorRota(p.coletaId, p.id, nf)}
                          title="Declarar saída do pátio"
                        >
                          {busy ? '…' : 'Saída pátio'}
                        </button>
                      )}

                      {/* Check-in */}
                      {p.statusExec === 'PENDENTE' && (
                        <button
                          style={{ ...btnMini, background: '#3b82f6', color: '#fff', border: 'none' }}
                          disabled={busy}
                          onClick={() => void executarAcaoParada(p.id, 'CHECKIN')}
                          title="Check-in na parada"
                        >
                          Check-in
                        </button>
                      )}

                      {/* Finalizar com POD */}
                      {(p.statusExec === 'EM_ATENDIMENTO' || p.statusExec === 'PENDENTE') && (
                        <button
                          style={{ ...btnMini, background: '#22c55e', color: '#0b1220', border: 'none' }}
                          disabled={busy}
                          onClick={() => openPodForm(p.id)}
                          title="Finalizar entrega com comprovante"
                        >
                          Entregar (POD)
                        </button>
                      )}

                      {/* Falha */}
                      {(p.statusExec === 'EM_ATENDIMENTO' || p.statusExec === 'PENDENTE') && (
                        <button
                          style={{ ...btnMini, background: '#ef4444', color: '#fff', border: 'none' }}
                          disabled={busy}
                          onClick={() => {
                            const obs = prompt('Motivo da falha (opcional):');
                            void executarAcaoParada(p.id, 'FALHA', obs || undefined);
                          }}
                          title="Marcar como falha"
                        >
                          Falha
                        </button>
                      )}

                      {p.statusExec === 'ENTREGUE' && (
                        <span style={{ fontSize: 11, opacity: 0.7 }}>Concluída</span>
                      )}
                      {p.statusExec === 'FALHA' && (
                        <span style={{ fontSize: 11, color: '#fca5a5' }}>Falhou</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {(!rota?.paradas || rota.paradas.length === 0) && (
              <tr>
                <td colSpan={9} style={{ padding: 14, opacity: 0.8 }}>
                  {loading ? 'Carregando paradas…' : '(Sem paradas nesta rota)'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* POD Form Modal */}
      {podParadaId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setPodParadaId(null); }}
        >
          <div
            style={{
              background: '#1e293b',
              borderRadius: 12,
              padding: 24,
              width: '100%',
              maxWidth: 440,
              border: '1px solid rgba(148,163,184,0.3)',
            }}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 900, color: '#e5e7eb' }}>
              Comprovante de Entrega (POD)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Nome do recebedor</div>
                <input
                  value={podNome}
                  onChange={(e) => setPodNome(e.target.value)}
                  placeholder="Nome completo"
                  style={podInput}
                  autoFocus
                />
              </label>
              <label>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Documento (CPF/RG)</div>
                <input
                  value={podDoc}
                  onChange={(e) => setPodDoc(e.target.value)}
                  placeholder="000.000.000-00"
                  style={podInput}
                />
              </label>
              <label>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Observações da entrega</div>
                <textarea
                  value={podObs}
                  onChange={(e) => setPodObs(e.target.value)}
                  placeholder="Ex: Entregue na portaria, conferido pelo fiscal..."
                  rows={3}
                  style={{ ...podInput, resize: 'vertical' }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPodParadaId(null)}
                style={{ ...btnMini, background: '#1A4A1A', color: '#e5e7eb', border: 'none', padding: '10px 16px' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => void finalizarComPod()}
                disabled={podSaving}
                style={{
                  ...btnMini,
                  background: podSaving ? '#334155' : '#22c55e',
                  color: podSaving ? '#94a3b8' : '#0b1220',
                  border: 'none',
                  padding: '10px 16px',
                  fontSize: 14,
                }}
              >
                {podSaving ? 'Salvando...' : 'Confirmar Entrega'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Mapa</h2>
        <div
          style={{
            marginTop: 10,
            height: 460,
            borderRadius: 10,
            border: '1px solid rgba(148,163,184,0.25)',
            background: 'rgba(15,23,42,0.35)',
            overflow: 'hidden',
          }}
        >
          {mapPoints.length > 0 ? (
            <LeafletMap points={mapPoints} lines={mapLines} />
          ) : (
            <div style={{ padding: 14, opacity: 0.8 }}>(Sem pontos para exibir)</div>
          )}
        </div>
      </div>
    </div>
  );
}

const podInput: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid rgba(148,163,184,0.3)',
  background: '#0f172a',
  color: '#e5e7eb',
  fontSize: 14,
};