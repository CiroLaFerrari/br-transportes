// src/app/scan/page.tsx
'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

type ScanOk = {
  ok: true;
  acao?: 'CHECKIN' | 'CHECKOUT' | 'STATUS' | 'JA_ENTREGUE';
  action?: 'CHECKIN' | 'CHECKOUT' | 'STATUS';
  message?: string;

  rotaId?: string | null;
  paradaId?: string | null;

  statusExec?: 'PENDENTE' | 'EM_ATENDIMENTO' | 'ENTREGUE' | 'FALHA';

  checkinAt?: string | null;
  checkoutAt?: string | null;

  label?: string | null;
  ordem?: number | null;

  coleta?: {
    id: string;
    nf?: string | null;
    cidade?: string | null;
    uf?: string | null;
    cliente?: string | null;
  } | null;
};

type ScanErr = { ok: false; error: string };
type ScanResp = ScanOk | ScanErr;

type RotaParada = {
  id: string;
  ordem: number;
  label: string;
  lat: number;
  lon: number;
  statusExec: 'PENDENTE' | 'EM_ATENDIMENTO' | 'ENTREGUE' | 'FALHA';
  checkinAt: string | null;
  checkoutAt: string | null;
  coletaId: string;
  Coleta?: {
    id: string;
    nf: string;
    cidade: string;
    uf: string;
    status?: 'EM_PATIO' | 'CARREGADA' | 'EM_TRANSITO' | 'ENTREGUE';
    entradaPatioAt?: string | null;
    embarqueAt?: string | null;
    fimPatioAt?: string | null;

    // ✅ novo (vem do backend /api/rotas/[id])
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
    return iso;
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

function badgeForStatusExec(s: RotaParada['statusExec']) {
  if (s === 'ENTREGUE') return { bg: '#dcfce7', color: '#166534', label: 'ENTREGUE' };
  if (s === 'EM_ATENDIMENTO') return { bg: '#fef3c7', color: '#92400e', label: 'EM ATENDIMENTO' };
  if (s === 'FALHA') return { bg: '#fee2e2', color: '#991b1b', label: 'FALHA' };
  return { bg: '#e2e8f0', color: '#0f172a', label: 'PENDENTE' };
}

export default function ScanPageWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Carregando scan...</div>}>
      <ScanPage />
    </Suspense>
  );
}

function ScanPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const rotaIdFromUrl = (sp.get('rotaId') || '').trim();

  const [code, setCode] = useState('');
  const pendingScanRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [resp, setResp] = useState<ScanResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<
    Array<{ at: string; code: string; ok: boolean; msg: string; rotaId?: string | null }>
  >([]);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // camera scanner
  const [cameraOn, setCameraOn] = useState(false);
  const scannerRef = useRef<any>(null);
  const scannerContainerId = 'qr-scanner-container';

  const startCamera = useCallback(async () => {
    if (scannerRef.current) return;
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode(scannerContainerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          setCode(decodedText);
          pendingScanRef.current = decodedText;
        },
        () => {},
      );
      setCameraOn(true);
    } catch (e: any) {
      alert('Falha ao abrir câmera: ' + (e?.message || e));
      setCameraOn(false);
    }
  }, []);

  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {}
      scannerRef.current = null;
    }
    setCameraOn(false);
  }, []);

  useEffect(() => {
    return () => { void stopCamera(); };
  }, [stopCamera]);

  // auto-submit after camera scan
  useEffect(() => {
    if (pendingScanRef.current && !loading) {
      const val = pendingScanRef.current;
      pendingScanRef.current = null;
      // small delay to let state settle
      const timer = setTimeout(() => {
        if (val) submitCode(val);
      }, 200);
      return () => clearTimeout(timer);
    }
  });

  const [rotaId, setRotaId] = useState<string>('');
  const [rotaLoading, setRotaLoading] = useState(false);
  const [rotaError, setRotaError] = useState<string | null>(null);
  const [rota, setRota] = useState<RotaDetalheResp['rota'] | null>(null);

  const [acaoLoadingId, setAcaoLoadingId] = useState<string | null>(null);
  const [acaoMsg, setAcaoMsg] = useState<string | null>(null);

  const isOk = resp && (resp as any).ok === true;

  useEffect(() => {
    if (rotaIdFromUrl) setRotaId(rotaIdFromUrl);
  }, [rotaIdFromUrl]);

  async function loadRota(id: string) {
    const rid = (id || '').trim();
    if (!rid) return;

    try {
      setRotaLoading(true);
      setRotaError(null);

      const res = await fetch(`/api/rotas/${encodeURIComponent(rid)}`, { cache: 'no-store' });
      const j = (await safeJson(res)) as RotaDetalheResp | null;

      if (!res.ok || !j || !j.ok || !j.rota) {
        const msg = (j as any)?.error || 'Falha ao carregar rota';
        setRotaError(msg);
        setRota(null);
        return;
      }

      const paradas = [...(j.rota.paradas || [])].sort((a, b) => a.ordem - b.ordem);
      setRota({ ...j.rota, paradas });
    } catch (e: any) {
      setRotaError(e?.message || 'Falha ao carregar rota');
      setRota(null);
    } finally {
      setRotaLoading(false);
    }
  }

  useEffect(() => {
    if (rotaId) void loadRota(rotaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotaId]);

  const headerBadge = useMemo(() => {
    if (!resp) return { label: 'Aguardando leitura', bg: '#e2e8f0', color: '#0f172a' };
    if ((resp as any).ok === false) return { label: 'Erro', bg: '#fee2e2', color: '#991b1b' };

    const r = resp as ScanOk;
    const a = r.action || r.acao;

    if (a === 'CHECKIN') return { label: 'CHECK-IN', bg: '#fef3c7', color: '#92400e' };
    if (a === 'CHECKOUT') return { label: 'CHECK-OUT', bg: '#dcfce7', color: '#166534' };
    if (a === 'JA_ENTREGUE') return { label: 'JÁ ENTREGUE', bg: '#e5e7eb', color: '#111827' };
    return { label: 'STATUS', bg: '#e0f2fe', color: '#075985' };
  }, [resp]);

  const progresso = useMemo(() => {
    const total = rota?.paradas?.length ?? rota?.totalParadas ?? 0;
    const entregues =
      rota?.entregues ?? (rota?.paradas ? rota.paradas.filter((p) => p.statusExec === 'ENTREGUE').length : 0);
    return { total, entregues };
  }, [rota]);

  const paradaAlvo = useMemo(() => {
    const ps = (rota?.paradas || []).slice().sort((a, b) => a.ordem - b.ordem);
    if (ps.length === 0) return null;

    const emAt = ps.find((p) => p.statusExec === 'EM_ATENDIMENTO');
    if (emAt) return emAt;

    const pend = ps.find((p) => p.statusExec === 'PENDENTE');
    if (pend) return pend;

    return null;
  }, [rota]);

  async function submitCode(overrideCode?: string) {
    const c = (overrideCode ?? code).trim();
    if (!c) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/scan/acao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: c, mode: 'AUTO', rotaId: rotaIdFromUrl || rotaId || null }),
      });

      const j = (await safeJson(res)) as any;

      if (!res.ok || !j) {
        const msg = j?.error || 'Falha ao executar ação';
        setResp({ ok: false, error: msg });
        setError(msg);

        setHistory((h) =>
          [{ at: new Date().toISOString(), code: c, ok: false, msg, rotaId: null }, ...h].slice(0, 20),
        );
        return;
      }

      setResp(j as ScanResp);

      const ok = (j as any).ok === true;
      if (ok) {
        const msg = (j as any).message || (j as any).acao || (j as any).action || 'OK';
        const rid = ((j as any).rotaId ?? null) as string | null;

        setHistory((h) =>
          [{ at: new Date().toISOString(), code: c, ok: true, msg, rotaId: rid }, ...h].slice(0, 20),
        );

        if (rid && !rotaId) setRotaId(rid);

        const effectiveRotaId = rotaIdFromUrl || rotaId || rid || '';
        if (effectiveRotaId) await loadRota(effectiveRotaId);
      } else {
        const msg = (j as any).error || 'Erro';
        setHistory((h) =>
          [{ at: new Date().toISOString(), code: c, ok: false, msg, rotaId: null }, ...h].slice(0, 20),
        );
      }

      setCode('');
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e: any) {
      const msg = e?.message || 'Erro inesperado';
      setError(msg);
      setResp({ ok: false, error: msg });
      setHistory((h) =>
        [{ at: new Date().toISOString(), code: c, ok: false, msg, rotaId: null }, ...h].slice(0, 20),
      );
    } finally {
      setLoading(false);
    }
  }

  async function declararSaidaPatio(coletaId: string, noteExtra?: string) {
    const cid = (coletaId || '').trim();
    if (!cid) return;

    const ok = window.confirm('Confirmar: motorista declarou SAÍDA DO PÁTIO para esta coleta?');
    if (!ok) return;

    setAcaoMsg(null);
    setAcaoLoadingId(cid);

    try {
      const res = await fetch(`/api/coletas/${encodeURIComponent(cid)}/acao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SAIDA_PATIO',
          note: noteExtra || 'Motorista declarou saída do pátio',
        }),
      });

      const j = await safeJson(res);

      if (!res.ok) {
        const msg = (j as any)?.error || 'Falha ao registrar saída do pátio';
        setAcaoMsg(`ERRO: ${msg}`);
      } else {
        setAcaoMsg('OK: Saída do pátio registrada (ação do motorista).');
        const effectiveRotaId = rotaIdFromUrl || rotaId || '';
        if (effectiveRotaId) await loadRota(effectiveRotaId);
      }
    } catch (e: any) {
      setAcaoMsg(`ERRO: ${e?.message || 'Falha ao registrar saída do pátio'}`);
    } finally {
      setAcaoLoadingId(null);
    }
  }

  const card: React.CSSProperties = {
    padding: 16,
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    background: '#ffffff',
    boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
  };

  const btn: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
  };

  const miniBtn: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 900,
  };

  return (
    <div style={{ padding: 16, minHeight: '100vh', color: '#1e293b' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, color: '#1A4A1A' }}>Rota</h1>
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>{rotaId || '(sem rotaId)'}</div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => router.back()} style={{ ...btn, background: '#f1f5f9', color: '#1A4A1A', border: '1px solid #d1d5db' }}>
            Voltar
          </button>

          <button
            onClick={() => {
              const id = rotaIdFromUrl || rotaId;
              if (id) void loadRota(id);
            }}
            disabled={rotaLoading || !(rotaIdFromUrl || rotaId)}
            style={{
              ...btn,
              background: '#1A4A1A',
              color: '#fff',
              opacity: rotaLoading || !(rotaIdFromUrl || rotaId) ? 0.6 : 1,
            }}
          >
            {rotaLoading ? 'Recarregando…' : 'Recarregar'}
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          padding: 14,
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          background: '#ffffff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
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
            <div style={{ fontSize: 12, opacity: 0.75 }}>Progresso</div>
            <div style={{ fontWeight: 900 }}>
              {progresso.entregues} / {progresso.total}
            </div>
          </div>
        </div>

        {rotaError && <div style={{ marginTop: 10, color: '#dc2626', fontWeight: 800 }}>{rotaError}</div>}
      </div>

      <div
        style={{
          marginTop: 10,
          padding: 12,
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          background: '#ffffff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Ação rápida (parada atual / próxima)</div>
          <div style={{ fontWeight: 900, fontSize: 13 }}>
            {paradaAlvo
              ? `#${paradaAlvo.ordem} — ${paradaAlvo.Coleta?.nf ? `NF ${paradaAlvo.Coleta.nf}` : paradaAlvo.coletaId}`
              : 'Nenhuma parada alvo (sem EM_ATENDIMENTO / PENDENTE)'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              if (!paradaAlvo) return;
              void declararSaidaPatio(
                paradaAlvo.coletaId,
                `Motorista declarou saída do pátio (via /scan topo) rota=${rotaId || rotaIdFromUrl || '-'} parada=${paradaAlvo.id}`,
              );
            }}
            disabled={!paradaAlvo || acaoLoadingId === (paradaAlvo?.coletaId || '')}
            style={{
              ...btn,
              background: !paradaAlvo ? '#d1d5db' : '#f59e0b',
              color: '#1e293b',
              opacity: !paradaAlvo || acaoLoadingId === (paradaAlvo?.coletaId || '') ? 0.6 : 1,
              fontWeight: 900,
            }}
            title="Declara a saída do pátio para a parada alvo (EM_ATENDIMENTO, senão próxima PENDENTE)"
          >
            {acaoLoadingId === (paradaAlvo?.coletaId || '') ? 'Enviando…' : 'Saída do pátio (motorista)'}
          </button>

          <button
            onClick={() => setTimeout(() => inputRef.current?.focus(), 50)}
            style={{
              ...btn,
              background: '#f1f5f9',
              color: '#1A4A1A',
              border: '1px solid #d1d5db',
              fontWeight: 900,
            }}
            title="Coloca o foco no campo de leitura"
          >
            Focar no scanner
          </button>

          <button
            onClick={() => cameraOn ? void stopCamera() : void startCamera()}
            style={{
              ...btn,
              background: cameraOn ? '#ef4444' : '#8b5cf6',
              color: '#fff',
              fontWeight: 900,
            }}
            title="Abrir/fechar câmera para leitura de QR Code"
          >
            {cameraOn ? 'Fechar câmera' : 'Abrir câmera'}
          </button>
        </div>
      </div>

      {/* Camera scanner container */}
      {cameraOn && (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            background: '#ffffff',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 8 }}>Leitura por câmera</div>
          <div
            id={scannerContainerId}
            style={{ maxWidth: 400, margin: '0 auto', borderRadius: 8, overflow: 'hidden' }}
          />
        </div>
      )}
      {!cameraOn && <div id={scannerContainerId} style={{ display: 'none' }} />}

      {acaoMsg && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            color: acaoMsg.startsWith('OK') ? '#16a34a' : '#dc2626',
            fontWeight: 900,
          }}
        >
          {acaoMsg}
        </div>
      )}

      <div
        style={{
          marginTop: 12,
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          background: '#ffffff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ textAlign: 'left', padding: 12, fontSize: 12, opacity: 0.9 }}>Ordem</th>
              <th style={{ textAlign: 'left', padding: 12, fontSize: 12, opacity: 0.9 }}>Parada</th>
              <th style={{ textAlign: 'left', padding: 12, fontSize: 12, opacity: 0.9 }}>NF / Cliente</th>
              <th style={{ textAlign: 'left', padding: 12, fontSize: 12, opacity: 0.9 }}>Pátio (dias)</th>
              <th style={{ textAlign: 'left', padding: 12, fontSize: 12, opacity: 0.9 }}>Status</th>
              <th style={{ textAlign: 'left', padding: 12, fontSize: 12, opacity: 0.9 }}>Check-in</th>
              <th style={{ textAlign: 'left', padding: 12, fontSize: 12, opacity: 0.9 }}>Check-out</th>
              <th style={{ textAlign: 'left', padding: 12, fontSize: 12, opacity: 0.9 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {(rota?.paradas || []).map((p) => {
              const b = badgeForStatusExec(p.statusExec);
              const nf = p.Coleta?.nf ?? '-';
              const cliente = p.Coleta?.Cliente?.razao ?? '-';
              const cidadeUf = p.Coleta ? `${p.Coleta.cidade} / ${p.Coleta.uf}` : '-';

              const lead = p.Coleta?.leadPatioDias ?? null;
              const aberto = !!p.Coleta?.patioAberto;

              const running = acaoLoadingId === p.coletaId;

              return (
                <tr key={p.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: 12, fontWeight: 900 }}>{p.ordem}</td>
                  <td style={{ padding: 12 }}>
                    <div style={{ fontWeight: 900 }}>{p.label}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      {p.lat.toFixed(6)}, {p.lon.toFixed(6)}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>
                      Parada ID: <code>{p.id}</code>
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>
                      Coleta ID: <code>{p.coletaId}</code>
                    </div>
                  </td>
                  <td style={{ padding: 12 }}>
                    <div style={{ fontWeight: 900 }}>{nf}</div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>{cliente}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>{cidadeUf}</div>
                  </td>
                  <td style={{ padding: 12, fontWeight: 900 }}>{fmtDias(lead, aberto)}</td>
                  <td style={{ padding: 12 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '4px 10px',
                        borderRadius: 999,
                        background: b.bg,
                        color: b.color,
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                    >
                      {b.label}
                    </span>
                  </td>
                  <td style={{ padding: 12, fontWeight: 800 }}>{p.checkinAt ? fmtDate(p.checkinAt) : '—'}</td>
                  <td style={{ padding: 12, fontWeight: 800 }}>{p.checkoutAt ? fmtDate(p.checkoutAt) : '—'}</td>
                  <td style={{ padding: 12 }}>
                    <button
                      onClick={() => declararSaidaPatio(p.coletaId)}
                      disabled={running}
                      style={{
                        ...miniBtn,
                        background: '#f59e0b',
                        color: '#1e293b',
                        opacity: running ? 0.65 : 1,
                      }}
                      title="Ação manual do motorista: saída do pátio"
                    >
                      {running ? 'Enviando…' : 'Saída do pátio'}
                    </button>
                  </td>
                </tr>
              );
            })}

            {(!rota?.paradas || rota.paradas.length === 0) && (
              <tr>
                <td colSpan={8} style={{ padding: 14, opacity: 0.8 }}>
                  {rotaLoading ? 'Carregando paradas…' : '(Sem paradas nesta rota)'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, ...card }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#1A4A1A' }}>SCAN — Coletas / Paradas</h2>
        <p style={{ marginTop: 6, marginBottom: 14, color: '#64748b' }}>
          Leia o código e pressione Enter. O sistema decide automaticamente: check-in / checkout.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCode();
            }}
            placeholder="Cole/escaneie o código aqui…"
            style={{
              flex: 1,
              minWidth: 280,
              padding: 12,
              borderRadius: 10,
              border: '1px solid #d1d5db',
              outline: 'none',
              fontSize: 16,
              background: '#ffffff',
              color: '#1e293b',
            }}
          />
          <button
            onClick={() => submitCode()}
            disabled={loading || !code.trim()}
            style={{
              padding: '10px 14px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 700,
              background: '#38bdf8',
              color: '#1e293b',
              opacity: loading || !code.trim() ? 0.6 : 1,
            }}
            title="Executar ação AUTO"
          >
            {loading ? 'Enviando…' : 'Enviar'}
          </button>

          <span
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              background: headerBadge.bg,
              color: headerBadge.color,
              fontWeight: 900,
              fontSize: 12,
            }}
          >
            {headerBadge.label}
          </span>
        </div>

        {error && <div style={{ marginTop: 10, color: '#dc2626', fontWeight: 900 }}>{error}</div>}

        {isOk && (
          <div style={{ marginTop: 14, borderTop: '1px dashed #e2e8f0', paddingTop: 12 }}>
            {(() => {
              const r = resp as ScanOk;

              // tenta achar a parada no estado atual da rota para mostrar lead time pátio
              const p = (rota?.paradas || []).find((x) => x.id === r.paradaId) || null;
              const lead = p?.Coleta?.leadPatioDias ?? null;
              const aberto = !!p?.Coleta?.patioAberto;

              return (
                <>
                  <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 6 }}>
                    {r.message || r.acao || r.action || 'Ação executada'}
                  </div>

                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Parada</div>
                      <div style={{ fontWeight: 900 }}>
                        #{r.ordem ?? '-'} — {r.label ?? '-'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Status</div>
                      <div style={{ fontWeight: 900 }}>{r.statusExec ?? '-'}</div>
                    </div>

                    <div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Pátio (dias)</div>
                      <div style={{ fontWeight: 900 }}>{fmtDias(lead, aberto)}</div>
                    </div>

                    <div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Checkout</div>
                      <div style={{ fontWeight: 900 }}>{fmtDate(r.checkoutAt)}</div>
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Coleta</div>
                      <div style={{ fontWeight: 900 }}>
                        {r.coleta?.nf ? `NF ${r.coleta.nf}` : '—'} • {r.coleta?.cliente ?? '—'} •{' '}
                        {r.coleta?.cidade ?? '—'}/{r.coleta?.uf ?? '—'}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {(r.rotaId || rotaId) && (
                      <Link
                        href={`/rotas/${r.rotaId || rotaId}`}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 999,
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 14,
                          fontWeight: 700,
                          background: '#22c55e',
                          color: '#1e293b',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        Abrir rota
                      </Link>
                    )}

                    <button
                      onClick={() => {
                        setResp(null);
                        setError(null);
                        setTimeout(() => inputRef.current?.focus(), 50);
                      }}
                      style={{ padding: '10px 14px', borderRadius: 999, border: '1px solid #d1d5db', cursor: 'pointer', fontSize: 14, fontWeight: 700, background: '#f1f5f9', color: '#1A4A1A' }}
                    >
                      Limpar
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      <div style={{ ...card, marginTop: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10, color: '#1A4A1A' }}>Últimas leituras</div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                Horário
              </th>
              <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                Código
              </th>
              <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                Resultado
              </th>
              <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                Rota
              </th>
            </tr>
          </thead>
          <tbody>
            {history.map((h, idx) => (
              <tr key={`${h.at}-${idx}`}>
                <td style={{ padding: 10, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                  {fmtDate(h.at)}
                </td>
                <td style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>
                  <code>{h.code}</code>
                </td>
                <td style={{ padding: 10, borderBottom: '1px solid #e2e8f0', fontWeight: 900 }}>
                  <span style={{ color: h.ok ? '#16a34a' : '#dc2626' }}>{h.ok ? 'OK' : 'ERRO'} </span>
                  <span style={{ color: '#64748b', fontWeight: 700 }}>{h.msg}</span>
                </td>
                <td style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>
                  {h.rotaId ? (
                    <Link href={`/rotas/${h.rotaId}`} style={{ fontWeight: 900, color: '#1A4A1A' }}>
                      abrir
                    </Link>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 12, color: '#64748b' }}>
                  (Sem leituras ainda)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
