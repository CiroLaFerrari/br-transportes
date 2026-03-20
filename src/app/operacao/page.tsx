'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Driver = { id: string; name: string };

// Aqui a gente normaliza para "plate" no front, independente do backend mandar "placa" ou "plate"
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

function pickArray(j: any): any[] {
  if (Array.isArray(j)) return j;
  if (Array.isArray(j?.items)) return j.items;
  if (Array.isArray(j?.data)) return j.data;
  if (Array.isArray(j?.value)) return j.value;
  if (Array.isArray(j?.rotas)) return j.rotas;
  return [];
}

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

      // ✅ corrige: rotas.map is not a function
      const rotasArr = pickArray(rotasJ) as any[];
      const driversArr = pickArray(driversJ) as any[];
      const vehiclesArr = pickArray(vehiclesJ) as any[];

      // Normaliza drivers
      const drv: Driver[] = driversArr
        .map((d) => ({
          id: String(d?.id || ''),
          name: String(d?.name || d?.nome || ''),
        }))
        .filter((d) => d.id && d.name);

      // Normaliza vehicles (aceita placa/plate)
      const veh: Vehicle[] = vehiclesArr
        .map((v) => ({
          id: String(v?.id || ''),
          plate: String(v?.plate || v?.placa || '').toUpperCase(),
          model: v?.model ?? null,
        }))
        .filter((v) => v.id && v.plate);

      // Normaliza rotas (garante stops array)
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
            ? {
                id: String(r.vehicle.id || ''),
                plate: String(r.vehicle.plate || r.vehicle.placa || '').toUpperCase(),
                model: r.vehicle.model ?? null,
              }
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

  // (opcional) mapas úteis para depurar
  const driverMap = useMemo(() => Object.fromEntries(drivers.map((d) => [d.id, d.name])), [drivers]);
  const vehicleMap = useMemo(() => Object.fromEntries(vehicles.map((v) => [v.id, v.plate])), [vehicles]);

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
    if (!r.ok) {
      setErro(j?.error || 'Falha ao atribuir');
      return;
    }

    setOk('Atribuição salva.');
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
    if (!r.ok) {
      setErro(j?.error || 'Falha ao mudar status');
      return;
    }

    setOk('Status atualizado.');
    await carregarTudo();
  }

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Operação — Atribuição e Status</h1>
        <button onClick={carregarTudo} disabled={loading} className="px-3 py-2 rounded border">
          {loading ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      {erro && <div className="text-red-600 text-sm">{erro}</div>}
      {ok && <div className="text-green-700 text-sm">{ok}</div>}

      <div className="space-y-4">
        {Array.isArray(rotas) &&
          rotas.map((r) => {
            const options = STATUS_FLOW[r.status] || [];

            return (
              <div key={r.id} className="border rounded p-4">
                <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                  <div>
                    <b>Data:</b> {new Date(r.createdAt).toLocaleString()}
                  </div>
                  <div>
                    <b>Status:</b> {r.status}
                  </div>
                  <div>
                    <b>Origem:</b> {r.origin}
                  </div>
                  <div>
                    <b>Total km:</b> {r.totalKm}
                  </div>
                  <div>
                    <b>Paradas:</b> {Array.isArray(r.stops) ? r.stops.length : 0}
                  </div>
                </div>

                <div className="mt-3 grid md:grid-cols-3 gap-3 items-end">
                  <label className="block">
                    <div className="text-sm text-gray-600">Motorista</div>
                    <select
                      className="border p-2 rounded w-full"
                      value={r.driverId ?? ''}
                      onChange={(e) => atribuir(r.id, e.target.value || undefined, r.vehicleId ?? undefined)}
                    >
                      <option value="">— Selecionar —</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <div className="text-sm text-gray-600">Veículo</div>
                    <select
                      className="border p-2 rounded w-full"
                      value={r.vehicleId ?? ''}
                      onChange={(e) => atribuir(r.id, r.driverId ?? undefined, e.target.value || undefined)}
                    >
                      <option value="">— Selecionar —</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.plate}
                          {v.model ? ` — ${v.model}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex gap-2">
                    {options.length === 0 ? (
                      <span className="text-xs text-gray-500 self-center">Sem transições disponíveis</span>
                    ) : (
                      options.map((next) => (
                        <button key={next} onClick={() => mudarStatus(r.id, next)} className="px-3 py-2 rounded border">
                          Mudar para {next}
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-3 flex gap-2 flex-wrap">
                  <Link href={`/rotas/${r.id}`} className="px-3 py-1 rounded bg-sky-100 text-sky-800 text-sm font-semibold hover:bg-sky-200">
                    Ver rota
                  </Link>
                  <Link href={`/scan?rotaId=${r.id}`} className="px-3 py-1 rounded bg-green-100 text-green-800 text-sm font-semibold hover:bg-green-200">
                    Scan
                  </Link>
                  <Link href={`/api/rotas/${r.id}/romaneio`} target="_blank" className="px-3 py-1 rounded bg-purple-100 text-purple-800 text-sm font-semibold hover:bg-purple-200">
                    Romaneio
                  </Link>
                </div>

                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-gray-700">Paradas (status)</summary>
                  <table className="w-full text-sm border mt-2">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left p-2 border">#</th>
                        <th className="text-left p-2 border">Destino</th>
                        <th className="text-left p-2 border">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(Array.isArray(r.stops) ? r.stops : []).map((s: any) => (
                        <tr key={s.id} className="border-t">
                          <td className="p-2 border">{s.order}</td>
                          <td className="p-2 border">{s.destination}</td>
                          <td className="p-2 border">{s.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>

              </div>
            );
          })}

        {(!Array.isArray(rotas) || rotas.length === 0) && (
          <div className="text-sm text-gray-600">Nenhuma rota cadastrada.</div>
        )}
      </div>
    </main>
  );
}