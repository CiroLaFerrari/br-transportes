'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Driver = { id: string; name: string };
type Vehicle = { id: string; plate: string; model?: string | null };
type Stop = { id: string; order: number; destination: string; status: string };

type Rota = {
  id: string;
  createdAt: string;
  origin: string;
  totalKm: number;
  status: 'PLANEJADA' | 'ATRIBUIDA' | 'EM_ROTA' | 'CONCLUIDA' | 'CANCELADA';
  driverId?: string | null;
  vehicleId?: string | null;
  driver?: Driver | null;
  vehicle?: Vehicle | null;
  stops: Stop[];
};

const STATUS_FLOW: Record<Rota['status'], Array<Rota['status']>> = {
  PLANEJADA: ['ATRIBUIDA', 'CANCELADA'],
  ATRIBUIDA: ['EM_ROTA', 'CANCELADA'],
  EM_ROTA: ['CONCLUIDA', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  PLANEJADA: { bg: '#dbeafe', color: '#1e40af' },
  ATRIBUIDA: { bg: '#fef3c7', color: '#92400e' },
  EM_ROTA: { bg: '#d1fae5', color: '#065f46' },
  CONCLUIDA: { bg: '#d1fae5', color: '#065f46' },
  CANCELADA: { bg: '#fee2e2', color: '#991b1b' },
};

function pickArray(j: any): any[] {
  if (Array.isArray(j)) return j;
  if (Array.isArray(j?.items)) return j.items;
  if (Array.isArray(j?.data)) return j.data;
  if (Array.isArray(j?.value)) return j.value;
  if (Array.isArray(j?.rotas)) return j.rotas;
  return [];
}

const card: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: 20,
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#1e293b',
  fontSize: 14,
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  background: '#1A4A1A',
  color: '#fff',
  border: 'none',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
};

const btnOutline: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 8,
  background: '#f8fafc',
  color: '#1A4A1A',
  border: '1px solid #d1d5db',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
};

export default function OperacaoPage() {
  const [rotas, setRotas] = useState<Rota[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function carregarTudo() {
    setErro(null);
    setOk(null);
    setLoading(true);

    try {
      const [r1, r2, r3] = await Promise.all([
        fetch('/api/rotas', { cache: 'no-store' }),
        fetch('/api/motoristas', { cache: 'no-store' }),
        fetch('/api/veiculos', { cache: 'no-store' }),
      ]);

      const [rotasJ, driversJ, vehiclesJ] = await Promise.all([
        r1.json().catch(() => null),
        r2.json().catch(() => null),
        r3.json().catch(() => null),
      ]);

      if (!r1.ok) throw new Error(rotasJ?.error || 'Falha ao carregar rotas');
      if (!r2.ok) throw new Error(driversJ?.error || 'Falha ao carregar motoristas');
      if (!r3.ok) throw new Error(vehiclesJ?.error || 'Falha ao carregar veículos');

      const rotasArr = pickArray(rotasJ) as any[];
      const driversArr = pickArray(driversJ) as any[];
      const vehiclesArr = pickArray(vehiclesJ) as any[];

      const drv: Driver[] = driversArr
        .map((d) => ({ id: String(d?.id || ''), name: String(d?.name || d?.nome || '') }))
        .filter((d) => d.id && d.name);

      const veh: Vehicle[] = vehiclesArr
        .map((v) => ({
          id: String(v?.id || ''),
          plate: String(v?.plate || v?.placa || '').toUpperCase(),
          model: v?.model ?? null,
        }))
        .filter((v) => v.id && v.plate);

      const rts: Rota[] = rotasArr
        .map((r) => ({
          id: String(r?.id || ''),
          createdAt: String(r?.createdAt || r?.created_at || new Date().toISOString()),
          origin: String(r?.origin || r?.origem || ''),
          totalKm: Number(r?.totalKm ?? r?.total_km ?? 0),
          status: (String(r?.status || 'PLANEJADA') as any) || 'PLANEJADA',
          driverId: r?.driverId ?? r?.motoristaId ?? null,
          vehicleId: r?.vehicleId ?? r?.veiculoId ?? null,
          driver: r?.driver
            ? { id: String(r.driver.id || ''), name: String(r.driver.name || r.driver.nome || '') }
            : null,
          vehicle: r?.vehicle
            ? { id: String(r.vehicle.id || ''), plate: String(r.vehicle.plate || r.vehicle.placa || '').toUpperCase(), model: r.vehicle.model ?? null }
            : null,
          stops: Array.isArray(r?.stops) ? r.stops : Array.isArray(r?.paradas) ? r.paradas : [],
        }))
        .filter((x) => x.id);

      setRotas(rts);
      setDrivers(drv);
      setVehicles(veh);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar');
      setRotas([]);
      setDrivers([]);
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void carregarTudo();
  }, []);

  async function atribuir(rotaId: string, driverId?: string, vehicleId?: string) {
    setErro(null);
    setOk(null);
    const payload: any = {};
    if (driverId) payload.driverId = driverId;
    if (vehicleId) payload.vehicleId = vehicleId;

    const r = await fetch(`/api/rotas/${rotaId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErro(j?.error || 'Falha ao atribuir'); return; }
    setOk('Atribuicao salva.');
    await carregarTudo();
  }

  async function mudarStatus(rotaId: string, next: Rota['status']) {
    setErro(null);
    setOk(null);
    const r = await fetch(`/api/rotas/${rotaId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErro(j?.error || 'Falha ao mudar status'); return; }
    setOk('Status atualizado.');
    await carregarTudo();
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: '#1A4A1A', margin: 0 }}>
          Operacao — Atribuicao e Status
        </h1>
        <button onClick={carregarTudo} disabled={loading} style={btnPrimary}>
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {erro && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          {erro}
        </div>
      )}
      {ok && (
        <div style={{ background: '#d1fae5', color: '#065f46', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          {ok}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {Array.isArray(rotas) && rotas.map((r) => {
          const options = STATUS_FLOW[r.status] || [];
          const sc = STATUS_COLORS[r.status] || { bg: '#f1f5f9', color: '#64748b' };

          return (
            <div key={r.id} style={card}>
              {/* Header */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 16 }}>
                <span style={{
                  background: sc.bg, color: sc.color,
                  padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
                }}>
                  {r.status}
                </span>
                <span style={{ fontSize: 13, color: '#64748b' }}>
                  {new Date(r.createdAt).toLocaleDateString('pt-BR')} {new Date(r.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {r.origin && (
                  <span style={{ fontSize: 13, color: '#1e293b' }}>
                    <b>Origem:</b> {r.origin}
                  </span>
                )}
                <span style={{ fontSize: 13, color: '#1e293b' }}>
                  <b>Km:</b> {r.totalKm}
                </span>
                <span style={{ fontSize: 13, color: '#1e293b' }}>
                  <b>Paradas:</b> {Array.isArray(r.stops) ? r.stops.length : 0}
                </span>
              </div>

              {/* Atribuicao */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4, display: 'block' }}>Motorista</label>
                  <select
                    style={selectStyle}
                    value={r.driverId ?? ''}
                    onChange={(e) => atribuir(r.id, e.target.value || undefined, r.vehicleId ?? undefined)}
                  >
                    <option value="">— Selecionar —</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4, display: 'block' }}>Veiculo</label>
                  <select
                    style={selectStyle}
                    value={r.vehicleId ?? ''}
                    onChange={(e) => atribuir(r.id, r.driverId ?? undefined, e.target.value || undefined)}
                  >
                    <option value="">— Selecionar —</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>{v.plate}{v.model ? ` — ${v.model}` : ''}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  {options.length === 0 ? (
                    <span style={{ fontSize: 12, color: '#64748b' }}>Sem transicoes</span>
                  ) : (
                    options.map((next) => (
                      <button
                        key={next}
                        onClick={() => mudarStatus(r.id, next)}
                        style={{
                          ...btnOutline,
                          ...(next === 'CANCELADA' ? { color: '#dc2626', borderColor: '#fca5a5' } : {}),
                        }}
                      >
                        {next}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Links */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link href={`/rotas/${r.id}`} style={{
                  padding: '6px 14px', borderRadius: 8, background: '#dbeafe', color: '#1e40af',
                  fontSize: 13, fontWeight: 600, textDecoration: 'none',
                }}>
                  Ver rota
                </Link>
                <Link href={`/scan?rotaId=${r.id}`} style={{
                  padding: '6px 14px', borderRadius: 8, background: '#d1fae5', color: '#065f46',
                  fontSize: 13, fontWeight: 600, textDecoration: 'none',
                }}>
                  Scan
                </Link>
                <Link href={`/api/rotas/${r.id}/romaneio`} target="_blank" style={{
                  padding: '6px 14px', borderRadius: 8, background: '#f3e8ff', color: '#6b21a8',
                  fontSize: 13, fontWeight: 600, textDecoration: 'none',
                }}>
                  Romaneio
                </Link>
              </div>

              {/* Paradas expandivel */}
              {Array.isArray(r.stops) && r.stops.length > 0 && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                    Paradas ({r.stops.length})
                  </summary>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>#</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>Destino</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.stops.map((s: any) => (
                        <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 10px' }}>{s.order}</td>
                          <td style={{ padding: '6px 10px' }}>{s.destination}</td>
                          <td style={{ padding: '6px 10px' }}>{s.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </div>
          );
        })}

        {(!Array.isArray(rotas) || rotas.length === 0) && !loading && (
          <div style={{ ...card, textAlign: 'center', color: '#64748b', padding: 40 }}>
            Nenhuma rota cadastrada.
          </div>
        )}
      </div>
    </div>
  );
}
