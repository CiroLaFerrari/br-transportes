'use client';

import React, { useEffect, useMemo, useState } from 'react';
import LeafletMap from '@/components/LeafletMap';

/** =========================
 *  Types
 *  ========================= */
type ApiPoint = { label: string; lon: number; lat: number };
type ApiLeg = {
  from: string;
  to: string;
  km?: number;
  dur_min?: number;
  distance?: number; // opcional (m)
  duration?: number; // opcional (s)
};

type ApiResp = {
  points: ApiPoint[];
  legs: ApiLeg[];
  total_km: number;
  total_dur_min: number;
  geojson?: { features?: any[] };
};

type PlanListItem = { id: string; name: string; createdAt: string };
type PlanFull = {
  id: string;
  name: string;
  createdAt: string;
  payload: ApiResp;
  status?: 'DRAFT' | 'PLANNED' | 'IN_TRANSIT' | 'DONE' | 'CANCELED';
  vehiclePlate?: string | null;
  driverName?: string | null;
  notes?: string | null;
};

type ParadaRow = {
  id: string;
  ordem: number;
  label: string;
  lon: number;
  lat: number;
  kmTrecho: number | null;
  durMinTrecho: number | null;
  coletaId: string;
  createdAt: string;

  // Campos de execução (Trilha 2)
  statusExec?: 'PENDENTE' | 'EM_ATENDIMENTO' | 'ENTREGUE' | 'FALHA';
  checkinAt?: string | null;
  checkoutAt?: string | null;
  obsStatus?: string | null;

  Coleta?: {
    id: string;
    nf: string;
    cidade: string;
    uf: string;
  } | null;
};

type ColetaRow = {
  id: string;
  nf: string;
  cidade: string;
  uf: string;
  valorFrete: number | null;
  pesoTotalKg: number | null;
  Cliente: { id: string; razao: string } | null;
};

type PatioColetaRow = {
  id: string;
  nf: string;
  cidade: string;
  uf: string;
  status?: 'EM_PATIO' | 'CARREGADA' | 'EM_TRANSITO' | 'ENTREGUE';
  entradaPatioAt?: string | null;
  embarqueAt?: string | null;
  fimPatioAt?: string | null;
  pesoTotalKg: number | null;
  valorFrete: number | null;
  Cliente?: { id?: string; razao?: string | null } | null;
};

type CostInputs = {
  diesel_price: number;
  consumption_km_per_litre: number;
  driver_hourly?: number;
  tolls: number[];
  extras: { label: string; value: number }[];
};

type CostBreakdown = {
  distance_km: number;
  duration_min: number;
  fuel_liters: number;
  fuel_cost: number;
  driver_hours: number;
  driver_cost: number;
  tolls_total: number;
  extras_total: number;
  subtotal: number;
  total: number;
};

type CostResult = {
  ok: boolean;
  planejamentoId: string;
  inputs: CostInputs;
  breakdown: CostBreakdown;
  sources?: {
    used_paradas_km?: boolean;
    used_payload_total_km?: boolean;
    used_payload_total_dur?: boolean;
  };
};

type Veiculo = {
  id: string;
  placa: string;
  capacidadeKg: number;
  capacidadeM3: number;
  compCm: number;
  largCm: number;
  altCm: number;
};

type MotoristaOption = {
  id: string;
  nome: string;
  documento: string | null;
  disponibilidade: boolean;
};

/**
 * ✅ Métricas (compatível com:
 * - formato novo: { ok, porColeta: { [coletaId]: { volumeM3, pesoKg } }, ... }
 * - formato antigo: array direto OU { data: [] }
 */
type MetricasResp =
  | {
      ok?: boolean;
      error?: string;
      totalColetas?: number;
      pesoTotalKg?: number;
      volumeTotalM3?: number;
      porColeta?: Record<string, { pesoKg?: number | null; volumeM3?: number | null }>;
      data?: Array<any>;
    }
  | Array<any>;

/** =========================
 *  Helpers
 *  ========================= */
function normalizeLeg(leg: ApiLeg) {
  const km =
    typeof leg.km === 'number'
      ? leg.km
      : typeof leg.distance === 'number'
        ? leg.distance > 1000
          ? leg.distance / 1000
          : leg.distance
        : 0;

  const durMin =
    typeof leg.dur_min === 'number'
      ? leg.dur_min
      : typeof leg.duration === 'number'
        ? Math.round(leg.duration / 60)
        : 0;

  return { km, durMin };
}

function defaultPlanName(origin: string, destinos: string) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');

  const origemTxt = origin.replace(/, Brasil$/i, '');
  const firstDest = (destinos.split('\n').map((s) => s.trim()).filter(Boolean)[0] || '').replace(/, Brasil$/i, '');

  return `Planejamento ${yyyy}-${mm}-${dd} ${hh}${mi} — ${origemTxt} → ${firstDest || 'destinos'}`;
}

function parseTolls(input: string): number[] {
  if (!input.trim()) return [];
  return input
    .split(/[;,]\s*|\n+/g)
    .map((s) => s.replace(',', '.').trim())
    .map(Number)
    .filter((v) => Number.isFinite(v) && v >= 0);
}

function parseExtras(input: string): { label: string; value: number }[] {
  if (!input.trim()) return [];
  return input
    .split(/\n+/g)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.split(/[:=]/);
      const label = (m[0] || '').trim();
      const value = Number((m[1] || '0').replace(',', '.').trim());
      return { label, value: Number.isFinite(value) ? value : 0 };
    })
    .filter((e) => e.label);
}

function fmtDate(iso: string) {
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

function computeExecSummary(paradas: ParadaRow[]) {
  const total = paradas.length;
  let pend = 0;
  let emAt = 0;
  let ent = 0;
  let falha = 0;

  for (const p of paradas) {
    switch (p.statusExec) {
      case 'EM_ATENDIMENTO':
        emAt += 1;
        break;
      case 'ENTREGUE':
        ent += 1;
        break;
      case 'FALHA':
        falha += 1;
        break;
      default:
        pend += 1;
        break;
    }
  }
  return { total, pend, emAt, ent, falha };
}

function parseIdsFromText(input: string): string[] {
  return input
    .split(/[\s,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * notes helper: salva/atualiza uma linha "FRETE_CLIENTE_PCT=6.5"
 */
function upsertFretePctInNotes(notesRaw: string, pct: string) {
  const key = 'FRETE_CLIENTE_PCT=';
  const lines = String(notesRaw || '').split('\n');
  const cleaned = lines.filter((l) => !l.trim().toUpperCase().startsWith(key));
  const v = String(pct || '').trim();
  if (v) cleaned.unshift(`${key}${v}`);
  return cleaned.join('\n').trim();
}

function extractFretePctFromNotes(notesRaw: string) {
  const key = 'FRETE_CLIENTE_PCT=';
  const lines = String(notesRaw || '').split('\n');
  for (const l of lines) {
    const t = l.trim();
    if (t.toUpperCase().startsWith(key)) {
      return t.slice(key.length).trim();
    }
  }
  return '';
}

function upsertMotoristaPctInNotes(notesRaw: string, pct: string) {
  const key = 'FRETE_MOTORISTA_PCT=';
  const lines = String(notesRaw || '').split('\n');
  const cleaned = lines.filter((l) => !l.trim().toUpperCase().startsWith(key));
  const v = String(pct || '').trim();
  if (v) cleaned.unshift(`${key}${v}`);
  return cleaned.join('\n').trim();
}
function extractMotoristaPctFromNotes(notesRaw: string) {
  const key = 'FRETE_MOTORISTA_PCT=';
  const lines = String(notesRaw || '').split('\n');
  for (const l of lines) {
    const t = l.trim();
    if (t.toUpperCase().startsWith(key)) {
      return t.slice(key.length).trim();
    }
  }
  return '';
}
function upsertMotoristaFixoInNotes(notesRaw: string, fixo: string) {
  const key = 'FRETE_MOTORISTA_FIXO=';
  const lines = String(notesRaw || '').split('\n');
  const cleaned = lines.filter((l) => !l.trim().toUpperCase().startsWith(key));
  const v = String(fixo || '').trim();
  if (v) cleaned.unshift(`${key}${v}`);
  return cleaned.join('\n').trim();
}
function extractMotoristaFixoFromNotes(notesRaw: string) {
  const key = 'FRETE_MOTORISTA_FIXO=';
  const lines = String(notesRaw || '').split('\n');
  for (const l of lines) {
    const t = l.trim();
    if (t.toUpperCase().startsWith(key)) {
      return t.slice(key.length).trim();
    }
  }
  return '';
}

function toNum(v: any): number {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function pickM3(row: any): number {
  const candidates = [
    row?.volumeTotalM3,
    row?.volumeM3,
    row?.totalM3,
    row?.m3Total,
    row?.volumesM3,
    row?.m3,
    row?.volume,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** =========================
 *  Component
 *  ========================= */
export default function PlanejamentoPage() {
  // Rota básica
  const [origin, setOrigin] = useState('São Carlos, SP, Brasil');
  const [destinos, setDestinos] = useState('Campinas, SP, Brasil');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mapa
  const [mapPoints, setMapPoints] = useState<Array<{ label: string; coord: [number, number] }>>([]);
  const [mapLines, setMapLines] = useState<any[]>([]);

  // Export
  const [exporting, setExporting] = useState(false);

  // Metadados / id do planejamento
  const [planId, setPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState<string>('');
  const [status, setStatus] = useState<'DRAFT' | 'PLANNED' | 'IN_TRANSIT' | 'DONE' | 'CANCELED'>('DRAFT');
  const [vehiclePlate, setVehiclePlate] = useState<string>('');
  const [driverName, setDriverName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaSavedMsg, setMetaSavedMsg] = useState<string>('');

  // ✅ Frete cliente (%) editável por planejamento (fica no notes por enquanto)
  const [freteClientePct, setFreteClientePct] = useState<string>('6.5');

  // ✅ Viabilidade: motorista (editável por planejamento)
  const [freteMotoristaPct, setFreteMotoristaPct] = useState<string>('0');
  const [freteMotoristaFixo, setFreteMotoristaFixo] = useState<string>('0');

  // Custo
  const [dieselPrice, setDieselPrice] = useState<string>('6.10');
  const [consumption, setConsumption] = useState<string>('6.5'); // km/l
  const [driverHourly, setDriverHourly] = useState<string>('18'); // R$/hora
  const [tollsText, setTollsText] = useState<string>(''); // "12,40; 8,70; 17"
  const [extrasText, setExtrasText] = useState<string>(''); // "Ajudante:50\nCarregamento:35"
  const [costLoading, setCostLoading] = useState(false);
  const [costResult, setCostResult] = useState<CostResult | null>(null);

  // Lista de planejamentos
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanListItem[]>([]);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(20);

  // ===== Paradas (coletas vinculadas) =====
  const [coletaIdsText, setColetaIdsText] = useState<string>('');
  const [paradas, setParadas] = useState<ParadaRow[]>([]);
  const [paradasLoading, setParadasLoading] = useState<boolean>(false);
  const [paradasError, setParadasError] = useState<string | null>(null);
  const [paradasInfo, setParadasInfo] = useState<string>('');

  // PATCH de parada (editar label/lon/lat)
  const [editParadaId, setEditParadaId] = useState<string>('');
  const [editLabel, setEditLabel] = useState<string>('');
  const [editLon, setEditLon] = useState<string>('');
  const [editLat, setEditLat] = useState<string>('');
  const [editLoading, setEditLoading] = useState<boolean>(false);
  const [editMsg, setEditMsg] = useState<string>('');

  // Busca de coletas para vincular
  const [coletasBuscaQ, setColetasBuscaQ] = useState<string>('');
  const [coletasBuscaLimit, setColetasBuscaLimit] = useState<number>(20);
  const [coletasBuscaLoading, setColetasBuscaLoading] = useState<boolean>(false);
  const [coletasBuscaErro, setColetasBuscaErro] = useState<string | null>(null);
  const [coletas, setColetas] = useState<ColetaRow[]>([]);

  // ✅ 1 clique (gerar rota + abrir /scan)
  const [oneClickLoading, setOneClickLoading] = useState(false);
  const [oneClickMsg, setOneClickMsg] = useState<string>('');

  // ✅ “Cargas no Pátio” (EM_PATIO)
  const [patioQ, setPatioQ] = useState('');
  const [patioLoading, setPatioLoading] = useState(false);
  const [patioErr, setPatioErr] = useState<string | null>(null);
  const [patioList, setPatioList] = useState<PatioColetaRow[]>([]);
  const [patioSelected, setPatioSelected] = useState<Record<string, boolean>>({});

  // ✅ Requisito 3: ações do planejamento fechado
  const [closing, setClosing] = useState(false);
  const [closeMsg, setCloseMsg] = useState<string>('');

  // ✅ Veículos (capacidade)
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [veiculosErr, setVeiculosErr] = useState<string | null>(null);

  // ✅ Motoristas
  const [motoristas, setMotoristas] = useState<MotoristaOption[]>([]);
  const [motoristasErr, setMotoristasErr] = useState<string | null>(null);

  // ✅ Métricas por coleta (volume M3)
  const [metricasMap, setMetricasMap] = useState<Record<string, { volumeM3: number }>>({});
  const [metricasErr, setMetricasErr] = useState<string | null>(null);

  // Atualiza o mapa sempre que mudarem as PARADAS ou o payload da rota
  useEffect(() => {
    if (paradas.length > 0 && data && Array.isArray(data.points) && data.points.length > 0) {
      const pts: Array<{ label: string; coord: [number, number] }> = [];

      const origem = data.points[0];
      if (
        origem &&
        typeof origem.lon === 'number' &&
        typeof origem.lat === 'number' &&
        Number.isFinite(origem.lon) &&
        Number.isFinite(origem.lat)
      ) {
        pts.push({
          label: origem.label ?? 'Origem',
          coord: [origem.lon, origem.lat],
        });
      }

      const ordenadas = [...paradas].sort((a, b) => a.ordem - b.ordem);
      for (const p of ordenadas) {
        if (typeof p.lon === 'number' && typeof p.lat === 'number' && Number.isFinite(p.lon) && Number.isFinite(p.lat)) {
          pts.push({
            label: p.label,
            coord: [p.lon, p.lat],
          });
        }
      }

      if (pts.length > 0) setMapPoints(pts);
      else setMapPoints([]);

      if (pts.length >= 2) {
        const geom = {
          type: 'LineString',
          coordinates: pts.map((p) => [p.coord[0], p.coord[1]]),
        };
        setMapLines([geom]);
      } else {
        setMapLines([]);
      }

      return;
    }

    if (data) {
      const pts = (data.points || []).map((p) => ({
        label: p.label,
        coord: [p.lon, p.lat] as [number, number],
      }));
      setMapPoints(pts);

      const lines = (data.geojson?.features || []).map((f: any) => f?.geometry).filter(Boolean);

      setMapLines(lines);
    } else {
      setMapPoints([]);
      setMapLines([]);
    }
  }, [paradas, data]);

  // estilos
  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 10px',
    border: '1px solid #e2e8f0',
    background: '#f8fafc',
    fontWeight: 700,
    color: '#0f172a',
  };
  const td: React.CSSProperties = {
    padding: '8px 10px',
    border: '1px solid #e2e8f0',
  };
  const tdNum: React.CSSProperties = { ...td, textAlign: 'right' };

  const labelStyle: React.CSSProperties = { marginBottom: 4, fontSize: 13, color: '#64748b' };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: 8,
    background: '#ffffff',
    color: '#1e293b',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
  };
  const sectionCard: React.CSSProperties = {
    marginTop: 16,
    padding: 16,
    border: '1px solid #e2e8f0',
    background: '#ffffff',
    borderRadius: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  };
  const btn: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
  };

  useEffect(() => {
    void loadPlans();
    void loadVeiculos();
    void loadMotoristas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadVeiculos() {
    try {
      setVeiculosErr(null);
      const res = await fetch('/api/veiculos?limit=200', { cache: 'no-store' });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'Falha ao carregar veículos');
      setVeiculos(Array.isArray(j) ? (j as Veiculo[]) : []);
    } catch (e: any) {
      setVeiculosErr(e?.message || 'Falha ao carregar veículos');
      setVeiculos([]);
    }
  }

  async function loadMotoristas() {
    try {
      setMotoristasErr(null);
      const res = await fetch('/api/motoristas?limit=200', { cache: 'no-store' });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'Falha ao carregar motoristas');
      setMotoristas(Array.isArray(j) ? (j as MotoristaOption[]) : []);
    } catch (e: any) {
      setMotoristasErr(e?.message || 'Falha ao carregar motoristas');
      setMotoristas([]);
    }
  }

  async function loadPlans() {
    try {
      setListLoading(true);
      setListError(null);
      const url = `/api/planejamentos?limit=${encodeURIComponent(String(limit))}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
      const res = await fetch(url);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao listar planejamentos');
      setPlans(j as PlanListItem[]);
    } catch (e: any) {
      setListError(e?.message || 'Falha ao listar planejamentos');
    } finally {
      setListLoading(false);
    }
  }

  async function openPlan(id: string) {
    try {
      setError(null);
      setCloseMsg('');
      const res = await fetch(`/api/planejamentos/${id}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao carregar planejamento');
      const plan = j as PlanFull;

      const payload = plan.payload as any;
      if (!payload || !Array.isArray(payload.points) || !Array.isArray(payload.legs)) {
        throw new Error('Payload inválido neste planejamento.');
      }

      const resp: ApiResp = {
        points: payload.points,
        legs: payload.legs,
        total_km: Number(payload.total_km ?? 0),
        total_dur_min: Number(payload.total_dur_min ?? 0),
        geojson: payload.geojson,
      };
      setData(resp);

      const pts = (resp.points || []).map((p) => ({
        label: p.label,
        coord: [p.lon, p.lat] as [number, number],
      }));
      const lines = (resp.geojson?.features || []).map((f: any) => f?.geometry).filter(Boolean);
      setMapPoints(pts);
      setMapLines(lines);

      setPlanId(plan.id);
      setPlanName(plan.name || '');
      setStatus((plan.status as any) || 'DRAFT');
      setVehiclePlate(plan.vehiclePlate || '');
      setDriverName(plan.driverName || '');

      const n = plan.notes || '';
      setNotes(n);

      const pct = extractFretePctFromNotes(n);
      setFreteClientePct(pct || '6.5');

      const mp = extractMotoristaPctFromNotes(n);
      setFreteMotoristaPct(mp || '0');

      const mf = extractMotoristaFixoFromNotes(n);
      setFreteMotoristaFixo(mf || '0');

      setMetaSavedMsg('');

      setCostResult(null);
      setParadas([]);
      setParadasError(null);
      setParadasInfo('');
      setEditParadaId('');
      setEditLabel('');
      setEditLon('');
      setEditLat('');
      setEditMsg('');
      setOneClickMsg('');

      setPatioSelected({});
      setMetricasMap({});
      setMetricasErr(null);
    } catch (e: any) {
      setError(e?.message || 'Falha ao abrir planejamento');
    }
  }

  async function deletePlan(id: string) {
    try {
      const ok = confirm('Excluir este planejamento? Essa ação não pode ser desfeita.');
      if (!ok) return;
      const res = await fetch(`/api/planejamentos/${id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao excluir planejamento');
      if (planId === id) {
        setPlanId(null);
        setPlanName('');
        setStatus('DRAFT');
        setVehiclePlate('');
        setDriverName('');
        setNotes('');
        setFreteClientePct('6.5');
        setFreteMotoristaPct('0');
        setFreteMotoristaFixo('0');
        setData(null);
        setMapPoints([]);
        setMapLines([]);
        setCostResult(null);
        setParadas([]);
        setOneClickMsg('');
        setPatioSelected({});
        setCloseMsg('');
        setMetricasMap({});
        setMetricasErr(null);
      }
      await loadPlans();
    } catch (e: any) {
      setError(e?.message || 'Falha ao excluir planejamento');
    }
  }

  async function calcular() {
    setLoading(true);
    setError(null);

    try {
      const places = [origin, ...destinos.split('\n').map((s) => s.trim()).filter(Boolean)];
      const res = await fetch('/api/maps/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ places }),
      });
      const j = await res.json();

      if (!res.ok) throw new Error(j?.error || 'Falha ao calcular rota');

      const resp: ApiResp = {
        points: (j.points || []) as ApiPoint[],
        legs: (j.legs || []) as ApiLeg[],
        total_km: Number(j.total_km),
        total_dur_min: Number(j.total_dur_min),
        geojson: j.geojson,
      };
      setData(resp);

      const pts = (resp.points || []).map((p) => ({
        label: p.label,
        coord: [p.lon, p.lat] as [number, number],
      }));
      const lines = (resp.geojson?.features || []).map((f: any) => f?.geometry).filter(Boolean);

      setMapPoints(pts);
      setMapLines(lines);

      if (!planName.trim()) setPlanName(defaultPlanName(origin, destinos));

      setPlanId(null);
      setCostResult(null);
      setMetaSavedMsg('');
      setParadas([]);
      setOneClickMsg('');
      setPatioSelected({});
      setCloseMsg('');
      setStatus('DRAFT');
      setMetricasMap({});
      setMetricasErr(null);
    } catch (e: any) {
      setError(e?.message || 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }

  async function ensurePlanId(): Promise<string> {
    if (planId) return planId;
    if (!data) throw new Error('Calcule a rota antes.');
    const name = (planName || defaultPlanName(origin, destinos)).trim();
    const res = await fetch('/api/planejamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, payload: data }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error || 'Falha ao salvar planejamento');
    const id = j.id as string;
    setPlanId(id);
    setPlanName(name);
    await loadPlans();
    return id;
  }

  async function exportarXlsx() {
    if (!data) {
      setError('Calcule a rota antes de exportar.');
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const id = await ensurePlanId();
      const url = `/api/planejamentos/${id}/xlsx`;
      window.open(url, '_blank');
    } catch (e: any) {
      setError(e?.message || 'Falha ao exportar .xlsx');
    } finally {
      setExporting(false);
    }
  }

  async function salvarMetadados() {
    try {
      setSavingMeta(true);
      setMetaSavedMsg('');
      setError(null);

      const id = await ensurePlanId();

      let mergedNotes = upsertFretePctInNotes(notes, freteClientePct);
      mergedNotes = upsertMotoristaPctInNotes(mergedNotes, freteMotoristaPct);
      mergedNotes = upsertMotoristaFixoInNotes(mergedNotes, freteMotoristaFixo);

      // Resolver IDs de veículo e motorista selecionados
      const resolvedVeiculoId = veiculoSelecionado?.id || null;
      const resolvedMotoristaId = motoristas.find((m) => m.nome === driverName)?.id || null;

      const res = await fetch(`/api/planejamentos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: planName,
          status,
          vehiclePlate,
          driverName,
          notes: mergedNotes,
          veiculoId: resolvedVeiculoId,
          motoristaId: resolvedMotoristaId,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao salvar metadados');

      setNotes(mergedNotes);
      setMetaSavedMsg('Metadados salvos com sucesso.');
      await loadPlans();
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar metadados');
    } finally {
      setSavingMeta(false);
    }
  }

  async function calcularCusto() {
    try {
      setCostLoading(true);
      setError(null);
      setCostResult(null);

      const id = await ensurePlanId();

      const body: CostInputs = {
        diesel_price: Number(dieselPrice.replace(',', '.')),
        consumption_km_per_litre: Number(consumption.replace(',', '.')),
        driver_hourly: driverHourly ? Number(driverHourly.replace(',', '.')) : undefined,
        tolls: parseTolls(tollsText),
        extras: parseExtras(extrasText),
      };

      const res = await fetch(`/api/planejamentos/${id}/cost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao calcular custo');

      setCostResult(j as CostResult);
    } catch (e: any) {
      setError(e?.message || 'Falha ao calcular custo');
    } finally {
      setCostLoading(false);
    }
  }

  async function loadParadas() {
    if (!planId) {
      setParadasError('Abra um planejamento antes.');
      return;
    }
    try {
      setParadasLoading(true);
      setParadasError(null);
      const res = await fetch(`/api/planejamentos/${planId}/paradas`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao listar paradas');
      const arr = ((j.value || j.paradas || []) as ParadaRow[]).sort((a, b) => a.ordem - b.ordem);
      setParadas(arr);
      setParadasInfo(`Carregado: ${arr.length} parada(s).`);

      if (arr.length > 0) refreshMapFromParadas(arr);

      // ✅ carrega métricas (volumes) das coletas vinculadas
      const ids = Array.from(new Set(arr.map((p) => p.coletaId).filter(Boolean)));
      if (ids.length) void loadMetricas(ids);
    } catch (e: any) {
      setParadasError(e?.message || 'Falha ao listar paradas');
    } finally {
      setParadasLoading(false);
    }
  }

  async function vincularColetas() {
    try {
      if (!planId) throw new Error('Abra/salve um planejamento antes.');

      const travado = paradas.some((p) => p.statusExec && p.statusExec !== 'PENDENTE');
      if (travado) {
        setParadasError('Não é possível vincular/alterar coletas após o início da execução (já existe parada em atendimento/entregue/falha).');
        return;
      }

      const ids = parseIdsFromText(coletaIdsText);
      if (ids.length === 0) throw new Error('Informe pelo menos um ID de coleta.');
      setParadasLoading(true);
      setParadasError(null);
      setParadasInfo('');

      const res = await fetch(`/api/planejamentos/${planId}/vincular-coletas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coletaIds: ids }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao vincular coletas');
      setParadasInfo('Coletas vinculadas com sucesso.');
      await loadParadas();
    } catch (e: any) {
      setParadasError(e?.message || 'Falha ao vincular coletas');
    } finally {
      setParadasLoading(false);
    }
  }

  function moveItem<T>(arr: T[], index: number, dir: -1 | 1): T[] {
    const n = [...arr];
    const j = index + dir;
    if (index < 0 || j < 0 || index >= n.length || j >= n.length) return n;
    const tmp = n[index];
    n[index] = n[j];
    n[j] = tmp;
    return n;
  }

  async function reordenarIndice(idx: number, dir: -1 | 1) {
    if (!planId) return;

    const travado = paradas.some((p) => p.statusExec && p.statusExec !== 'PENDENTE');
    if (travado) {
      setParadasError('Não é possível reordenar paradas após o início da execução (já existe check-in / atendimento / entrega).');
      return;
    }

    const novo = moveItem(paradas, idx, dir);
    setParadas(novo);

    const ordem = novo.map((p) => p.id);
    try {
      setParadasLoading(true);
      setParadasError(null);
      setParadasInfo('');

      const res = await fetch(`/api/planejamentos/${planId}/paradas/reordenar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordem }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao reordenar paradas');

      setParadasInfo('Paradas reordenadas.');
      await loadParadas();
    } catch (e: any) {
      setParadasError(e?.message || 'Falha ao reordenar paradas');
    } finally {
      setParadasLoading(false);
    }
  }

  async function recalcularParadas() {
    if (!planId) return;

    const travado = paradas.some((p) => p.statusExec && p.statusExec !== 'PENDENTE');
    if (travado) {
      setParadasError('Não é possível recalcular trechos após o início da execução (já existe parada em atendimento/entregue/falha).');
      return;
    }

    try {
      setParadasLoading(true);
      setParadasError(null);
      setParadasInfo('');

      const res = await fetch(`/api/planejamentos/${planId}/paradas/recalcular`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao recalcular trechos');

      setParadasInfo('Trechos recalculados.');
      await loadParadas();
    } catch (e: any) {
      setParadasError(e?.message || 'Falha ao recalcular trechos');
    } finally {
      setParadasLoading(false);
    }
  }

  async function otimizarParadas() {
    if (!planId) {
      setParadasError('Abra um planejamento antes.');
      return;
    }

    const travado = paradas.some((p) => p.statusExec && p.statusExec !== 'PENDENTE');
    if (travado) {
      setParadasError('Não é possível otimizar a ordem após o início da execução (já existe parada em atendimento/entregue/falha).');
      return;
    }

    try {
      setParadasLoading(true);
      setParadasError(null);
      setParadasInfo('');

      const res = await fetch(`/api/planejamentos/${planId}/paradas/otimizar`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao otimizar paradas');

      const arr = ((j.value || j.paradas || []) as ParadaRow[]).sort((a, b) => a.ordem - b.ordem);
      setParadas(arr);
      setParadasInfo('Paradas otimizadas (ordem sugerida pelo sistema).');

      if (arr.length > 0) refreshMapFromParadas(arr);

      const ids = Array.from(new Set(arr.map((p) => p.coletaId).filter(Boolean)));
      if (ids.length) void loadMetricas(ids);
    } catch (e: any) {
      setParadasError(e?.message || 'Falha ao otimizar paradas');
    } finally {
      setParadasLoading(false);
    }
  }

  async function patchParada() {
    try {
      if (!planId) throw new Error('Abra um planejamento antes.');
      if (!editParadaId.trim()) throw new Error('Informe o ID da parada.');
      const body: any = {};
      if (editLabel.trim()) body.label = editLabel.trim();
      if (editLon.trim() !== '') body.lon = Number(editLon.replace(',', '.'));
      if (editLat.trim() !== '') body.lat = Number(editLat.replace(',', '.'));

      setEditLoading(true);
      setEditMsg('');
      setParadasError(null);

      const res = await fetch(`/api/planejamentos/${planId}/paradas/${encodeURIComponent(editParadaId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao editar parada');
      setEditMsg('Parada atualizada.');
      await loadParadas();
    } catch (e: any) {
      setParadasError(e?.message || 'Falha ao editar parada');
    } finally {
      setEditLoading(false);
    }
  }

  async function carregarColetas() {
    try {
      setColetasBuscaLoading(true);
      setColetasBuscaErro(null);
      const url = `/api/coletas?limit=${encodeURIComponent(String(coletasBuscaLimit))}${coletasBuscaQ ? `&q=${encodeURIComponent(coletasBuscaQ)}` : ''}`;
      const res = await fetch(url);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao buscar coletas');
      setColetas(j as ColetaRow[]);
    } catch (e: any) {
      setColetasBuscaErro(e?.message || 'Falha ao buscar coletas');
    } finally {
      setColetasBuscaLoading(false);
    }
  }

  function adicionarIdColeta(id: string) {
    const ids = parseIdsFromText(coletaIdsText);
    if (!ids.includes(id)) ids.push(id);
    setColetaIdsText(ids.join(' '));
  }

  async function loadPatio() {
    try {
      setPatioLoading(true);
      setPatioErr(null);

      const qs = new URLSearchParams();
      qs.set('limit', '200');
      qs.set('status', 'EM_PATIO');
      if (patioQ.trim()) qs.set('q', patioQ.trim());

      const res = await fetch(`/api/coletas?${qs.toString()}`, { cache: 'no-store' });
      const j = await res.json().catch(() => null);

      if (!res.ok) throw new Error(j?.error || 'Falha ao carregar coletas do pátio');

      const arr: PatioColetaRow[] = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [];
      setPatioList(arr);

      setPatioSelected((prev) => {
        const keep: Record<string, boolean> = {};
        const idsSet = new Set(arr.map((x) => x.id));
        for (const [k, v] of Object.entries(prev)) {
          if (v && idsSet.has(k)) keep[k] = true;
        }
        return keep;
      });

      // ✅ métricas para o pátio também (volume)
      const ids = Array.from(new Set(arr.map((x) => x.id)));
      if (ids.length) void loadMetricas(ids);
    } catch (e: any) {
      setPatioErr(e?.message || 'Falha ao carregar pátio');
      setPatioList([]);
    } finally {
      setPatioLoading(false);
    }
  }

  /**
   * ✅ Corrigido: agora lê o novo formato com porColeta
   * e mantém compatibilidade com array/data antigo.
   */
  async function loadMetricas(ids: string[]) {
    try {
      setMetricasErr(null);
      if (!ids.length) return;

      const res = await fetch('/api/coletas/metricas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });

      const j = (await res.json().catch(() => null)) as MetricasResp | null;
      if (!res.ok || !j) throw new Error((j as any)?.error || 'Falha ao carregar métricas');

      const map: Record<string, { volumeM3: number }> = {};

      // ✅ NOVO: porColeta
      const porColeta = !Array.isArray(j) ? (j as any)?.porColeta : null;
      if (porColeta && typeof porColeta === 'object') {
        for (const [coletaId, v] of Object.entries(porColeta)) {
          const n = Number((v as any)?.volumeM3 ?? 0);
          map[String(coletaId)] = { volumeM3: Number.isFinite(n) ? n : 0 };
        }
        setMetricasMap((prev) => ({ ...prev, ...map }));
        return;
      }

      // ✅ ANTIGO: array direto ou { data: [] }
      const arr = Array.isArray(j) ? j : Array.isArray((j as any)?.data) ? (j as any).data : [];
      for (const row of arr as any[]) {
        const coletaId = String(row?.coletaId || row?.id || '').trim();
        if (!coletaId) continue;
        map[coletaId] = { volumeM3: pickM3(row) };
      }

      setMetricasMap((prev) => ({ ...prev, ...map }));
    } catch (e: any) {
      setMetricasErr(e?.message || 'Falha ao carregar métricas');
    }
  }

  const patioSelectedRows = useMemo(() => {
    const sel = new Set(Object.entries(patioSelected).filter(([_, v]) => v).map(([k]) => k));
    return patioList.filter((c) => sel.has(c.id));
  }, [patioList, patioSelected]);

  const patioResumo = useMemo(() => {
    const totalSel = patioSelectedRows.length;

    const byUf: Record<string, number> = {};
    let peso = 0;
    let frete = 0;
    let volumeM3 = 0;

    for (const c of patioSelectedRows) {
      const uf = String(c.uf || '').toUpperCase() || '—';
      byUf[uf] = (byUf[uf] || 0) + 1;

      const p = Number(c.pesoTotalKg || 0);
      const f = Number(c.valorFrete || 0);
      if (Number.isFinite(p)) peso += p;
      if (Number.isFinite(f)) frete += f;

      const m3 = metricasMap[c.id]?.volumeM3 ?? 0;
      volumeM3 += Number.isFinite(m3) ? m3 : 0;
    }

    const ufs = Object.entries(byUf)
      .sort((a, b) => b[1] - a[1])
      .map(([uf, n]) => ({ uf, n }));

    return { totalSel, ufs, peso, frete, volumeM3 };
  }, [patioSelectedRows, metricasMap]);

  function patioToggleAll(val: boolean) {
    const next: Record<string, boolean> = {};
    for (const c of patioList) next[c.id] = val;
    setPatioSelected(next);
  }

  function patioAddSelectedToIds() {
    const ids = parseIdsFromText(coletaIdsText);
    const setIds = new Set(ids);
    for (const c of patioSelectedRows) setIds.add(c.id);
    const out = Array.from(setIds);
    setColetaIdsText(out.join(' '));
    setParadasInfo(`Adicionadas ${patioSelectedRows.length} coleta(s) do pátio ao campo de IDs.`);
  }

  /** Gera destinos automaticamente a partir das coletas selecionadas no pátio */
  function gerarDestinosAuto() {
    const rows = patioSelectedRows.length > 0 ? patioSelectedRows : patioList;
    if (rows.length === 0) {
      setError('Carregue e/ou selecione coletas no pátio primeiro.');
      return;
    }

    // Collect unique "Cidade, UF" from selected coletas
    const seen = new Set<string>();
    const cities: string[] = [];
    for (const c of rows) {
      const cidade = String(c.cidade || '').trim();
      const uf = String(c.uf || '').trim().toUpperCase();
      if (!cidade || !uf) continue;
      const key = `${cidade.toUpperCase()}, ${uf}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cities.push(`${cidade}, ${uf}, Brasil`);
    }

    if (cities.length === 0) {
      setError('Nenhuma cidade válida encontrada nas coletas selecionadas.');
      return;
    }

    setDestinos(cities.join('\n'));
    if (!origin.trim()) setOrigin('São Carlos, SP, Brasil');
    setError(null);
    setParadasInfo(`${cities.length} destino(s) gerado(s) automaticamente a partir de ${rows.length} coleta(s).`);
  }

  function refreshMapFromParadas(paradasList: ParadaRow[]) {
    const pts: Array<{ label: string; coord: [number, number] }> = [];

    if (data && Array.isArray(data.points) && data.points[0]) {
      const o = data.points[0];
      if (Number.isFinite(o.lon) && Number.isFinite(o.lat)) {
        pts.push({
          label: o.label || 'Origem',
          coord: [o.lon, o.lat],
        });
      }
    }

    for (const p of paradasList) {
      if (p.lon != null && p.lat != null && Number.isFinite(p.lon) && Number.isFinite(p.lat) && !(p.lon === 0 && p.lat === 0)) {
        pts.push({
          label: p.label,
          coord: [p.lon, p.lat],
        });
      }
    }

    if (pts.length === 0) return;

    if (pts.length === 1) {
      setMapPoints(pts);
      setMapLines([]);
      return;
    }

    const geom = {
      type: 'LineString',
      coordinates: pts.map((p) => [p.coord[0], p.coord[1]]),
    };

    setMapPoints(pts);
    setMapLines([geom]);
  }

  const execSummary = computeExecSummary(paradas);
  const execTravado = paradas.some((p) => p.statusExec && p.statusExec !== 'PENDENTE');

  async function oneClickGerarRotaEAbrirScan() {
    try {
      setOneClickMsg('');
      setParadasError(null);
      setError(null);

      if (!planId) throw new Error('Abra um planejamento antes.');

      let totalParadas = paradas.length;

      if (totalParadas === 0) {
        const resP = await fetch(`/api/planejamentos/${planId}/paradas`);
        const jP = await resP.json();
        if (!resP.ok) throw new Error(jP?.error || 'Falha ao verificar paradas');
        const arr = ((jP.value || jP.paradas || []) as ParadaRow[]) || [];
        totalParadas = arr.length;
        if (arr.length) setParadas(arr.sort((a, b) => a.ordem - b.ordem));
      }

      if (totalParadas === 0) {
        throw new Error('Este planejamento não tem paradas. Vincule coletas antes.');
      }

      const started = execTravado;
      if (started) {
        const ok = confirm('Já existe execução em andamento (check-in/entrega). Este 1 clique vai RESETAR status das paradas para PENDENTE. Continuar?');
        if (!ok) return;
      }

      setOneClickLoading(true);

      const res = await fetch(`/api/planejamentos/${planId}/gerar-rota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetStatusParadas: true }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'Falha ao gerar rota');

      const rotaId = j?.rota?.id as string | undefined;
      if (!rotaId) throw new Error('API gerou a rota, mas não retornou rota.id');

      window.location.href = `/scan?rotaId=${encodeURIComponent(rotaId)}`;
    } catch (e: any) {
      setParadasError(e?.message || 'Falha no 1 clique');
    } finally {
      setOneClickLoading(false);
    }
  }

  async function fecharCarga() {
    try {
      setCloseMsg('');
      setError(null);

      const id = await ensurePlanId();

      const ok = confirm('Fechar carga? Isso marca o planejamento como PLANNED (fechado).');
      if (!ok) return;

      setClosing(true);

      const res = await fetch(`/api/planejamentos/${id}/fechar`, { method: 'POST' });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Falha ao fechar carga');

      setStatus('PLANNED');
      setCloseMsg('OK: carga fechada (status PLANNED).');

      await loadPlans();
    } catch (e: any) {
      setError(e?.message || 'Falha ao fechar carga');
    } finally {
      setClosing(false);
    }
  }

  async function imprimirPlanejamento() {
    try {
      setError(null);
      const id = await ensurePlanId();
      window.open(`/api/planejamentos/${id}/print`, '_blank');
    } catch (e: any) {
      setError(e?.message || 'Falha ao imprimir');
    }
  }

  async function exportarCsvPlanejamento() {
    try {
      setError(null);
      const id = await ensurePlanId();
      window.open(`/api/planejamentos/${id}/csv`, '_blank');
    } catch (e: any) {
      setError(e?.message || 'Falha ao exportar CSV');
    }
  }

  const isFechado = status !== 'DRAFT';

  // ======================
  // ✅ Totais / Viabilidade / Capacidade
  // ======================
  const coletasVinculadasResumo = useMemo(() => {
    const ids = Array.from(new Set(paradas.map((p) => p.coletaId).filter(Boolean)));
    const setIds = new Set(ids);

    const index: Record<string, { pesoKg: number; frete: number }> = {};

    for (const c of patioList) {
      index[c.id] = { pesoKg: toNum(c.pesoTotalKg), frete: toNum(c.valorFrete) };
    }
    for (const c of coletas) {
      index[c.id] = { pesoKg: toNum(c.pesoTotalKg), frete: toNum(c.valorFrete) };
    }

    let pesoKg = 0;
    let frete = 0;
    let volumeM3 = 0;

    for (const id of setIds) {
      pesoKg += index[id]?.pesoKg ?? 0;
      frete += index[id]?.frete ?? 0;
      volumeM3 += metricasMap[id]?.volumeM3 ?? 0;
    }

    return { ids, pesoKg, frete, volumeM3 };
  }, [paradas, patioList, coletas, metricasMap]);

  const veiculoSelecionado = useMemo(() => {
    const plate = String(vehiclePlate || '').trim().toUpperCase();
    if (!plate) return null;
    return veiculos.find((v) => String(v.placa || '').toUpperCase() === plate) || null;
  }, [vehiclePlate, veiculos]);

  const capacidade = useMemo(() => {
    const capKg = veiculoSelecionado?.capacidadeKg ?? null;
    const capM3 = veiculoSelecionado?.capacidadeM3 ?? null;

    const usedKg = coletasVinculadasResumo.pesoKg;
    const usedM3 = coletasVinculadasResumo.volumeM3;

    const overKg = capKg != null ? usedKg > capKg : false;
    const overM3 = capM3 != null ? usedM3 > capM3 : false;

    const pctKg = capKg && capKg > 0 ? (usedKg / capKg) * 100 : null;
    const pctM3 = capM3 && capM3 > 0 ? (usedM3 / capM3) * 100 : null;

    const excedKg = capKg != null ? usedKg - capKg : null;
    const excedM3 = capM3 != null ? usedM3 - capM3 : null;

    return { capKg, capM3, usedKg, usedM3, overKg, overM3, pctKg, pctM3, excedKg, excedM3 };
  }, [veiculoSelecionado, coletasVinculadasResumo]);

  const viabilidade = useMemo(() => {
    const pctCliente = toNum(freteClientePct);
    const pctMotorista = toNum(freteMotoristaPct);
    const fixoMotorista = toNum(freteMotoristaFixo);

    const freteBruto = coletasVinculadasResumo.frete;
    const receita = freteBruto * (pctCliente / 100);

    const custo = costResult?.breakdown?.total != null ? Number(costResult.breakdown.total) : 0;

    const motoristaValor = receita * (pctMotorista / 100) + fixoMotorista;

    const lucro = receita - custo - motoristaValor;

    return {
      pctCliente,
      pctMotorista,
      fixoMotorista,
      freteBruto,
      receita,
      custo,
      motoristaValor,
      lucro,
    };
  }, [freteClientePct, freteMotoristaPct, freteMotoristaFixo, coletasVinculadasResumo, costResult]);

  const travaFecharCarga = capacidade.overKg || capacidade.overM3;

  function renderBar(pct: number | null) {
    const p = pct == null || !Number.isFinite(pct) ? 0 : Math.max(0, pct);
    const capped = Math.min(140, p); // deixa “passar” visualmente se estourar
    const color = p >= 100 ? '#ef4444' : p >= 80 ? '#f59e0b' : '#22c55e';
    return (
      <div style={{ width: 220, height: 10, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${capped}%`, height: 10, background: color }} />
      </div>
    );
  }

  return (
    <div style={{ padding: 16, color: '#1e293b', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 4, color: '#1A4A1A' }}>Planejamento de Rota</h1>
      <p style={{ marginBottom: 16, color: '#64748b', fontSize: 14 }}>Calcule rotas, salve planejamentos, vincule coletas e visualize tudo no mapa.</p>

      {/* ✅ CARGAS NO PÁTIO */}
      <div style={{ ...sectionCard, marginTop: 0 }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8, color: '#1A4A1A' }}>Cargas no Pátio (EM_PATIO)</h2>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
          <input value={patioQ} onChange={(e) => setPatioQ(e.target.value)} placeholder="Buscar por NF, cidade, cliente" style={{ ...inputStyle, maxWidth: 320 }} />

          <button
            onClick={() => void loadPatio()}
            disabled={patioLoading}
            style={{ ...btn, background: '#0ea5e9', color: '#1e293b', opacity: patioLoading ? 0.7 : 1 }}
            title="Carregar coletas em EM_PATIO"
          >
            {patioLoading ? 'Carregando…' : 'Carregar pátio'}
          </button>

          <button onClick={() => patioToggleAll(true)} disabled={patioLoading || patioList.length === 0} style={{ ...btn, background: '#f1f5f9', color: 'white', opacity: patioLoading ? 0.7 : 1 }}>
            Selecionar tudo
          </button>

          <button onClick={() => patioToggleAll(false)} disabled={patioLoading || patioList.length === 0} style={{ ...btn, background: '#f1f5f9', color: 'white', opacity: patioLoading ? 0.7 : 1 }}>
            Limpar seleção
          </button>

          <button
            onClick={() => patioAddSelectedToIds()}
            disabled={patioSelectedRows.length === 0}
            style={{ ...btn, background: patioSelectedRows.length ? '#22c55e' : '#94a3b8', color: '#1e293b', opacity: patioSelectedRows.length ? 1 : 0.7 }}
            title="Adiciona as coletas selecionadas ao campo de IDs abaixo"
          >
            Adicionar selecionadas (→ IDs)
          </button>

          <button
            onClick={gerarDestinosAuto}
            disabled={patioList.length === 0}
            style={{ ...btn, background: patioList.length ? '#7c3aed' : '#94a3b8', color: 'white', opacity: patioList.length ? 1 : 0.7 }}
            title="Preenche automaticamente os destinos da rota a partir das cidades das coletas selecionadas (ou todas se nenhuma selecionada)"
          >
            Gerar rota automática
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#475569' }}>
              Selecionadas: <b>{patioResumo.totalSel}</b>
            </span>
            <span style={{ fontSize: 12, color: '#475569' }}>
              Peso: <b>{Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(patioResumo.peso)}</b> kg
            </span>
            <span style={{ fontSize: 12, color: '#475569' }}>
              Volume: <b>{Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(patioResumo.volumeM3)}</b> m³
            </span>
            <span style={{ fontSize: 12, color: '#475569' }}>
              Frete: <b>{Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(patioResumo.frete)}</b>
            </span>
          </div>
        </div>

        {patioErr && <div style={{ color: '#b91c1c', marginBottom: 8 }}>{patioErr}</div>}
        {metricasErr && <div style={{ color: '#b91c1c', marginBottom: 8 }}>{metricasErr}</div>}

        {patioResumo.ufs.length > 0 && (
          <div style={{ marginBottom: 10, fontSize: 13, color: '#64748b' }}>
            <b>Resumo por UF (selecionadas):</b> {patioResumo.ufs.map((x) => `${x.uf}: ${x.n}`).join(' • ')}
          </div>
        )}

        {patioList.length > 0 && (() => {
          const ufCount: Record<string, number> = {};
          for (const c of patioList) {
            const u = String(c.uf || '').toUpperCase();
            if (u) ufCount[u] = (ufCount[u] || 0) + 1;
          }
          const entries = Object.entries(ufCount).sort((a, b) => b[1] - a[1]);
          return (
            <div style={{ marginBottom: 10, fontSize: 13, color: '#475569' }}>
              <b>Total NF por UF (pátio):</b> {entries.map(([uf, n]) => `${uf}: ${n}`).join(' • ')} — Total: {patioList.length}
            </div>
          );
        })()}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#ffffff' }}>
            <thead>
              <tr>
                <th style={th}>Sel</th>
                <th style={th}>NF</th>
                <th style={th}>Cliente</th>
                <th style={th}>Cidade/UF</th>
                <th style={th}>Peso (kg)</th>
                <th style={th}>Volume (m³)</th>
                <th style={th}>Frete (R$)</th>
                <th style={th}>Entrada pátio</th>
                <th style={th}>ID</th>
              </tr>
            </thead>
            <tbody>
              {patioList.map((c) => (
                <tr key={c.id}>
                  <td style={td}>
                    <input type="checkbox" checked={!!patioSelected[c.id]} onChange={(e) => setPatioSelected((prev) => ({ ...prev, [c.id]: e.target.checked }))} />
                  </td>
                  <td style={td}>
                    <b>{c.nf}</b>
                  </td>
                  <td style={td}>{c.Cliente?.razao ?? '—'}</td>
                  <td style={td}>
                    {c.cidade} / {String(c.uf || '').toUpperCase()}
                  </td>
                  <td style={tdNum}>{c.pesoTotalKg ?? '-'}</td>
                  <td style={tdNum}>{metricasMap[c.id]?.volumeM3 != null ? metricasMap[c.id].volumeM3.toFixed(3) : '-'}</td>
                  <td style={tdNum}>{c.valorFrete ?? '-'}</td>
                  <td style={td}>{c.entradaPatioAt ? fmtDate(c.entradaPatioAt) : '-'}</td>
                  <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{c.id}</td>
                </tr>
              ))}
              {patioList.length === 0 && !patioLoading && (
                <tr>
                  <td style={td} colSpan={9}>
                    (Nenhuma coleta EM_PATIO carregada)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, color: '#64748b', fontSize: 12 }}>
          Dica: selecione as coletas e clique em <b>“Adicionar selecionadas (→ IDs)”</b>, depois use <b>“Vincular coletas”</b> na seção de Paradas.
        </div>
      </div>

      {/* LISTA DE PLANEJAMENTOS */}
      <div style={{ ...sectionCard }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8, color: '#1A4A1A' }}>Meus Planejamentos</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome" style={{ ...inputStyle, maxWidth: 260 }} />
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ ...inputStyle, width: 90 } as any}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
          <button onClick={loadPlans} disabled={listLoading} style={{ ...btn, background: '#2563eb', color: 'white', opacity: listLoading ? 0.7 : 1 }}>
            {listLoading ? 'Atualizando…' : 'Atualizar lista'}
          </button>
        </div>

        {listError && <div style={{ color: '#b91c1c', marginBottom: 8 }}>{listError}</div>}

        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#ffffff' }}>
          <thead>
            <tr>
              <th style={th}>Nome</th>
              <th style={th}>Criado em</th>
              <th style={th}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td style={td}>{p.name}</td>
                <td style={td}>{fmtDate(p.createdAt)}</td>
                <td style={td}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => openPlan(p.id)} style={{ ...btn, background: '#10b981', color: 'white' }} title="Abrir">
                      Abrir
                    </button>
                    <button onClick={() => deletePlan(p.id)} style={{ ...btn, background: '#ef4444', color: 'white' }} title="Excluir">
                      Excluir
                    </button>
                    <a href={`/planejamento/${p.id}/carga`} style={{ ...btn, background: '#7c3aed', color: 'white', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }} title="Layout de carga">
                      Carga
                    </a>
                  </div>
                </td>
              </tr>
            ))}
            {plans.length === 0 && !listLoading && (
              <tr>
                <td style={td} colSpan={3}>
                  (Sem registros)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* FORM ROTA */}
      <div style={{ ...sectionCard }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8, color: '#1A4A1A' }}>Calcular rota</h2>
        <div style={{ display: 'grid', gap: 8, maxWidth: 1000 }}>
          <label>
            <div style={labelStyle}>Origem (pátio/endereço completo)</div>
            <input value={origin} onChange={(e) => setOrigin(e.target.value)} style={inputStyle} placeholder="Ex.: São Carlos, SP, Brasil" />
          </label>

          <label>
            <div style={labelStyle}>Destinos — um por linha</div>
            <textarea value={destinos} onChange={(e) => setDestinos(e.target.value)} rows={3} style={{ ...inputStyle, minHeight: 80 }} placeholder={'Campinas, SP, Brasil\nFlorianópolis, SC, Brasil'} />
          </label>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <button onClick={calcular} disabled={loading} style={{ ...btn, background: '#2563eb', color: 'white', padding: '8px 14px', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Calculando…' : 'Calcular km'}
            </button>

            <button
              onClick={exportarXlsx}
              disabled={!data || exporting}
              style={{ ...btn, background: '#10b981', color: 'white', padding: '8px 14px', cursor: !data ? 'not-allowed' : 'pointer', opacity: !data || exporting ? 0.7 : 1 }}
              title={!data ? 'Calcule uma rota para habilitar' : 'Exportar para Excel (.xlsx)'}
            >
              {exporting ? 'Gerando .xlsx…' : 'Exportar .xlsx'}
            </button>
          </div>
        </div>
      </div>

      {error && <div style={{ marginTop: 12, color: '#b91c1c', fontSize: 14 }}>{error}</div>}

      {/* METADADOS + VIABILIDADE + CAPACIDADE */}
      {data && (
        <div style={sectionCard}>
          <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8, color: '#1A4A1A' }}>Metadados do Planejamento</h2>

          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', maxWidth: 1000 }}>
            <label style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={labelStyle}>Nome</span>
              <input value={planName} onChange={(e) => setPlanName(e.target.value)} style={inputStyle} placeholder="Ex.: Roteiro 2025-11-01 – Turno manhã" />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={labelStyle}>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as any)} style={inputStyle as any}>
                <option value="DRAFT">DRAFT</option>
                <option value="PLANNED">PLANNED</option>
                <option value="IN_TRANSIT">IN_TRANSIT</option>
                <option value="DONE">DONE</option>
                <option value="CANCELED">CANCELED</option>
              </select>
              <span style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{isFechado ? 'Planejamento considerado “fechado” (status != DRAFT).' : 'Aberto (DRAFT).'}</span>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={labelStyle}>Placa do veículo</span>
              {veiculos.length > 0 ? (
                <select
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  style={inputStyle as any}
                >
                  <option value="">— Selecione um veículo —</option>
                  {veiculos.map((v) => (
                    <option key={v.id} value={v.placa}>
                      {v.placa} — {Intl.NumberFormat('pt-BR').format(v.capacidadeKg)} kg • {Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(v.capacidadeM3)} m³ • {v.compCm}×{v.largCm}×{v.altCm} cm
                    </option>
                  ))}
                </select>
              ) : (
                <input value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())} style={inputStyle} placeholder="ABC1D23" />
              )}
              {veiculosErr && <span style={{ fontSize: 12, color: '#b91c1c', marginTop: 4 }}>{veiculosErr}</span>}
              {veiculos.length === 0 && !veiculosErr && <span style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>Nenhum veículo cadastrado. Cadastre em /veiculos primeiro.</span>}
              {vehiclePlate && !veiculoSelecionado && veiculos.length > 0 && <span style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>Placa não encontrada na lista de veículos (capacidade não será travada).</span>}
              {veiculoSelecionado && (
                <span style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  Capacidade: <b>{Intl.NumberFormat('pt-BR').format(veiculoSelecionado.capacidadeKg)}</b> kg •{' '}
                  <b>{Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(veiculoSelecionado.capacidadeM3)}</b> m³ •{' '}
                  Dimensões: <b>{veiculoSelecionado.compCm}×{veiculoSelecionado.largCm}×{veiculoSelecionado.altCm}</b> cm
                </span>
              )}
            </label>

            <label style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={labelStyle}>Motorista</span>
              {motoristas.length > 0 ? (
                <select
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  style={inputStyle as any}
                >
                  <option value="">— Selecione um motorista —</option>
                  {motoristas.map((m) => (
                    <option key={m.id} value={m.nome}>
                      {m.nome}{m.documento ? ` (${m.documento})` : ''}{!m.disponibilidade ? ' [INDISPONÍVEL]' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={driverName} onChange={(e) => setDriverName(e.target.value)} style={inputStyle} placeholder="João Silva" />
              )}
              {motoristasErr && <span style={{ fontSize: 12, color: '#b91c1c', marginTop: 4 }}>{motoristasErr}</span>}
              {motoristas.length === 0 && !motoristasErr && <span style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>Nenhum motorista cadastrado. Cadastre em /motoristas.</span>}
            </label>

            <label style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={labelStyle}>Frete cliente (%)</span>
              <input value={freteClientePct} onChange={(e) => setFreteClientePct(e.target.value)} style={inputStyle} placeholder="6.5" title="Campo editável por planejamento. Salva dentro do notes como FRETE_CLIENTE_PCT=..." />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={labelStyle}>Frete motorista (%)</span>
              <input value={freteMotoristaPct} onChange={(e) => setFreteMotoristaPct(e.target.value)} style={inputStyle} placeholder="0" title="Editável por planejamento. Salva no notes como FRETE_MOTORISTA_PCT=..." />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={labelStyle}>Frete motorista fixo (R$)</span>
              <input value={freteMotoristaFixo} onChange={(e) => setFreteMotoristaFixo(e.target.value)} style={inputStyle} placeholder="0" title="Editável por planejamento. Salva no notes como FRETE_MOTORISTA_FIXO=..." />
            </label>

            <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column' }}>
              <span style={labelStyle}>Observações</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, minHeight: 70 }} placeholder="Janela de atendimento 08:00–12:00; descarregar com paleteira." />
            </label>
          </div>

          {/* ✅ Painel capacidade + viabilidade */}
          <div style={{ marginTop: 14, padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                <b>Carga vinculada (paradas):</b> {coletasVinculadasResumo.ids.length} NF(s) •{' '}
                <b>{Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(coletasVinculadasResumo.pesoKg)}</b> kg •{' '}
                <b>{Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(coletasVinculadasResumo.volumeM3)}</b> m³ •{' '}
                <b>{Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(coletasVinculadasResumo.frete)}</b> frete bruto
              </div>

              {veiculoSelecionado && (
                <div style={{ marginLeft: 'auto', fontSize: 13, color: capacidade.overKg || capacidade.overM3 ? '#b91c1c' : '#166534' }}>
                  <b>Capacidade:</b>{' '}
                  {capacidade.capKg != null ? `${Intl.NumberFormat('pt-BR').format(capacidade.usedKg)} / ${Intl.NumberFormat('pt-BR').format(capacidade.capKg)} kg` : '—'} •{' '}
                  {capacidade.capM3 != null
                    ? `${Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(capacidade.usedM3)} / ${Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(capacidade.capM3)} m³`
                    : '—'}
                </div>
              )}
            </div>

            {/* ✅ Barras de ocupação */}
            {veiculoSelecionado && (
              <div style={{ marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 110, fontSize: 12, color: '#475569', fontWeight: 700 }}>Ocupação (kg)</div>
                  {renderBar(capacidade.pctKg)}
                  <div style={{ fontSize: 12, color: capacidade.pctKg != null && capacidade.pctKg >= 100 ? '#b91c1c' : '#64748b', fontWeight: 800, minWidth: 70 }}>
                    {capacidade.pctKg == null ? '—' : `${capacidade.pctKg.toFixed(0)}%`}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 110, fontSize: 12, color: '#475569', fontWeight: 700 }}>Ocupação (m³)</div>
                  {renderBar(capacidade.pctM3)}
                  <div style={{ fontSize: 12, color: capacidade.pctM3 != null && capacidade.pctM3 >= 100 ? '#b91c1c' : '#64748b', fontWeight: 800, minWidth: 70 }}>
                    {capacidade.pctM3 == null ? '—' : `${capacidade.pctM3.toFixed(0)}%`}
                  </div>
                </div>
              </div>
            )}

            {/* ✅ Painel viabilidade financeira */}
            {coletasVinculadasResumo.ids.length > 0 && (
              <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#166534', marginBottom: 8 }}>Viabilidade Financeira</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 13 }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Frete bruto:</span>{' '}
                    <b>{Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(viabilidade.freteBruto)}</b>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Receita ({viabilidade.pctCliente}%):</span>{' '}
                    <b>{Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(viabilidade.receita)}</b>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Custo rota:</span>{' '}
                    <b>{Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(viabilidade.custo)}</b>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Motorista:</span>{' '}
                    <b>{Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(viabilidade.motoristaValor)}</b>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}> ({viabilidade.pctMotorista}% + R${viabilidade.fixoMotorista})</span>
                  </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 15, fontWeight: 800, color: viabilidade.lucro >= 0 ? '#166534' : '#b91c1c' }}>
                  Lucro estimado: {Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(viabilidade.lucro)}
                  {viabilidade.receita > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 8, color: '#475569' }}>
                      (margem: {((viabilidade.lucro / viabilidade.receita) * 100).toFixed(1)}%)
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ✅ Mensagem de trava detalhada */}
            {travaFecharCarga && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239' }}>
                <b>Trava ativa:</b> a carga excede a capacidade do veículo.
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  {capacidade.overKg && capacidade.excedKg != null && (
                    <div>
                      • Excedeu <b>{Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(capacidade.excedKg)}</b> kg
                    </div>
                  )}
                  {capacidade.overM3 && capacidade.excedM3 != null && (
                    <div>
                      • Excedeu <b>{Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(capacidade.excedM3)}</b> m³
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>Ajuste as coletas (paradas) ou selecione outro veículo.</div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={salvarMetadados} disabled={!data || savingMeta} style={{ ...btn, background: '#f59e0b', color: '#1e293b', padding: '8px 14px', cursor: !data ? 'not-allowed' : 'pointer', opacity: !data || savingMeta ? 0.7 : 1 }}>
              {savingMeta ? 'Salvando…' : 'Salvar metadados'}
            </button>

            <button
              onClick={fecharCarga}
              disabled={closing || travaFecharCarga}
              style={{ ...btn, background: travaFecharCarga ? '#94a3b8' : '#1A4A1A', color: 'white', padding: '8px 14px', opacity: closing || travaFecharCarga ? 0.7 : 1, cursor: travaFecharCarga ? 'not-allowed' : 'pointer' }}
              title={travaFecharCarga ? 'Bloqueado: excedeu capacidade do veículo.' : 'Marca o planejamento como PLANNED.'}
            >
              {closing ? 'Fechando…' : 'Fechar carga'}
            </button>

            <button onClick={imprimirPlanejamento} style={{ ...btn, background: '#0ea5e9', color: '#1e293b', padding: '8px 14px' }} title="Abre um HTML pronto pra imprimir">
              Imprimir
            </button>

            <button onClick={exportarCsvPlanejamento} style={{ ...btn, background: '#22c55e', color: '#1e293b', padding: '8px 14px' }} title="Export CSV do planejamento">
              Export CSV
            </button>

            {planId && (
              <div style={{ alignSelf: 'center', opacity: 0.7, fontSize: 12 }}>
                ID: <code>{planId}</code>
              </div>
            )}
            {metaSavedMsg && <div style={{ alignSelf: 'center', color: '#16a34a', fontSize: 13 }}>{metaSavedMsg}</div>}
            {closeMsg && <div style={{ alignSelf: 'center', color: '#16a34a', fontSize: 13 }}>{closeMsg}</div>}
          </div>
        </div>
      )}

      {/* TABELA LEGS */}
      {data && (
        <div style={{ ...sectionCard }}>
          <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8, color: '#1A4A1A' }}>Resumo da rota</h2>

          <div style={{ marginBottom: 6 }}>
            <strong>Origem:</strong> {origin.replace(/, Brasil$/i, '')}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#ffffff' }}>
            <thead>
              <tr>
                <th style={th}>Destino</th>
                <th style={th}>Distância (km)</th>
                <th style={th}>Duração (min)</th>
              </tr>
            </thead>
            <tbody>
              {data.legs.map((leg, i) => {
                const { km, durMin } = normalizeLeg(leg);
                return (
                  <tr key={i}>
                    <td style={td}>{String(leg.to).replace(/, Brasil$/i, '')}</td>
                    <td style={tdNum}>{km.toFixed(2)}</td>
                    <td style={tdNum}>{durMin}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ marginTop: 10, fontWeight: 600 }}>
            Total: {Number(data.total_km).toFixed(2)} km • {Number(data.total_dur_min)} min
          </div>
        </div>
      )}

      {/* CUSTO */}
      {data && (
        <div style={sectionCard}>
          <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8, color: '#1A4A1A' }}>Cálculo de Custo</h2>

          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', maxWidth: 1000 }}>
            <label style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={labelStyle}>Diesel (R$/L)</span>
              <input value={dieselPrice} onChange={(e) => setDieselPrice(e.target.value)} style={inputStyle} placeholder="6.10" />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={labelStyle}>Consumo (km/L)</span>
              <input value={consumption} onChange={(e) => setConsumption(e.target.value)} style={inputStyle} placeholder="6.5" />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={labelStyle}>Motorista (R$/h)</span>
              <input value={driverHourly} onChange={(e) => setDriverHourly(e.target.value)} style={inputStyle} placeholder="18" />
            </label>

            <div />

            <label style={{ display: 'flex', flexDirection: 'column', gridColumn: '1 / 3' }}>
              <span style={labelStyle}>Pedágios (separe por vírgula, ponto e vírgula ou nova linha)</span>
              <textarea value={tollsText} onChange={(e) => setTollsText(e.target.value)} rows={2} style={{ ...inputStyle, minHeight: 60 }} placeholder={'12,40; 8,70; 17'} />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gridColumn: '3 / -1' }}>
              <span style={labelStyle}>Extras por linha (formato: Nome:valor)</span>
              <textarea value={extrasText} onChange={(e) => setExtrasText(e.target.value)} rows={2} style={{ ...inputStyle, minHeight: 60 }} placeholder={'Ajudante:50\nCarregamento:35'} />
            </label>
          </div>

          <div style={{ marginTop: 10 }}>
            <button onClick={calcularCusto} disabled={costLoading} style={{ ...btn, background: '#22c55e', color: '#1e293b', padding: '8px 14px', opacity: costLoading ? 0.7 : 1 }}>
              {costLoading ? 'Calculando…' : 'Calcular custo'}
            </button>
          </div>

          {costResult && (
            <div style={{ marginTop: 12 }}>
              <div style={{ marginBottom: 6 }}>
                <strong>Resumo:</strong> {costResult.breakdown.distance_km} km • {costResult.breakdown.duration_min} min
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, background: '#fff' }}>
                <thead>
                  <tr>
                    <th style={th}>Item</th>
                    <th style={th}>Valor (R$)</th>
                    <th style={th}>Obs</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={td}>Combustível</td>
                    <td style={tdNum}>{Number(costResult.breakdown.fuel_cost).toFixed(2)}</td>
                    <td style={td}>
                      Litros: {costResult.breakdown.fuel_liters.toFixed(2)} @ R$ {Number(costResult.inputs.diesel_price).toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td style={td}>Motorista</td>
                    <td style={tdNum}>{Number(costResult.breakdown.driver_cost).toFixed(2)}</td>
                    <td style={td}>
                      Horas: {Number(costResult.breakdown.driver_hours).toFixed(2)} @ R$ {costResult.inputs.driver_hourly ?? 0}/h
                    </td>
                  </tr>
                  <tr>
                    <td style={td}>Pedágios</td>
                    <td style={tdNum}>{Number(costResult.breakdown.tolls_total).toFixed(2)}</td>
                    <td style={td}>{(costResult.inputs.tolls || []).join(', ')}</td>
                  </tr>
                  <tr>
                    <td style={td}>Extras</td>
                    <td style={tdNum}>{Number(costResult.breakdown.extras_total).toFixed(2)}</td>
                    <td style={td}>{(costResult.inputs.extras || []).map((e: any) => `${e.label}: ${Number(e.value).toFixed(2)}`).join(' | ')}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ ...td, fontWeight: 700 }}>TOTAL</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{Number(costResult.breakdown.total).toFixed(2)}</td>
                    <td style={td}>BRL</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PARADAS + BUSCA DE COLETAS */}
      {planId && (
        <div style={sectionCard}>
          <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8, color: '#1A4A1A' }}>Paradas (coletas vinculadas)</h2>

          {paradas.length > 0 && (
            <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
              <span style={{ padding: '2px 10px', borderRadius: 999, background: '#e2e8f0', color: '#0f172a' }}>Total: {execSummary.total}</span>
              <span style={{ padding: '2px 10px', borderRadius: 999, background: '#e5e7eb', color: '#4b5563' }}>Pendente: {execSummary.pend}</span>
              <span style={{ padding: '2px 10px', borderRadius: 999, background: '#fef3c7', color: '#92400e' }}>Em atendimento: {execSummary.emAt}</span>
              <span style={{ padding: '2px 10px', borderRadius: 999, background: '#dcfce7', color: '#166534' }}>Entregue: {execSummary.ent}</span>
              <span style={{ padding: '2px 10px', borderRadius: 999, background: '#fee2e2', color: '#991b1b' }}>Falha: {execSummary.falha}</span>
              {execTravado && <span style={{ padding: '2px 10px', borderRadius: 999, background: '#f97316', color: '#1e293b', fontWeight: 600 }}>Execução em andamento — alterações estruturais bloqueadas.</span>}
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Buscar coletas para vincular</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <input value={coletasBuscaQ} onChange={(e) => setColetasBuscaQ(e.target.value)} placeholder="Buscar por NF, cidade ou cliente" style={{ ...inputStyle, maxWidth: 280 }} />
              <select value={coletasBuscaLimit} onChange={(e) => setColetasBuscaLimit(Number(e.target.value))} style={{ ...inputStyle, width: 90 } as any}>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <button onClick={carregarColetas} disabled={coletasBuscaLoading} style={{ ...btn, background: '#2563eb', color: 'white', opacity: coletasBuscaLoading ? 0.7 : 1 }}>
                {coletasBuscaLoading ? 'Carregando…' : 'Carregar coletas'}
              </button>
            </div>
            {coletasBuscaErro && <div style={{ color: '#b91c1c', marginBottom: 8 }}>{coletasBuscaErro}</div>}

            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#ffffff', marginBottom: 8 }}>
              <thead>
                <tr>
                  <th style={th}>NF</th>
                  <th style={th}>Cliente</th>
                  <th style={th}>Cidade/UF</th>
                  <th style={th}>Peso (kg)</th>
                  <th style={th}>Frete (R$)</th>
                  <th style={th}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {coletas.map((c) => (
                  <tr key={c.id}>
                    <td style={td}>{c.nf}</td>
                    <td style={td}>{c.Cliente?.razao ?? '-'}</td>
                    <td style={td}>
                      {c.cidade} / {c.uf}
                    </td>
                    <td style={tdNum}>{c.pesoTotalKg ?? '-'}</td>
                    <td style={tdNum}>{c.valorFrete ?? '-'}</td>
                    <td style={td}>
                      <button onClick={() => adicionarIdColeta(c.id)} style={{ ...btn, background: '#0ea5e9', color: '#0f172a' }}>
                        Adicionar ID
                      </button>
                    </td>
                  </tr>
                ))}
                {coletas.length === 0 && !coletasBuscaLoading && (
                  <tr>
                    <td style={td} colSpan={6}>
                      (Nenhuma coleta carregada)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr', maxWidth: 1000 }}>
            <label style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={labelStyle}>IDs de coletas (separe por espaço, vírgula ou quebra de linha)</span>
              <textarea value={coletaIdsText} onChange={(e) => setColetaIdsText(e.target.value)} rows={2} style={{ ...inputStyle, minHeight: 60 }} placeholder={'cmXXXXXXXX1 cmYYYYYYYY2\ncmZZZZZZZZ3'} />
            </label>
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={loadParadas} disabled={paradasLoading} style={{ ...btn, background: '#64748b', color: 'white', opacity: paradasLoading ? 0.7 : 1 }}>
              {paradasLoading ? 'Atualizando…' : 'Atualizar (carregar)'}
            </button>

            <button onClick={vincularColetas} disabled={paradasLoading} style={{ ...btn, background: '#7c3aed', color: 'white', opacity: paradasLoading ? 0.7 : 1 }}>
              Vincular coletas
            </button>

            <button onClick={recalcularParadas} disabled={paradasLoading} style={{ ...btn, background: '#22c55e', color: '#1e293b', opacity: paradasLoading ? 0.7 : 1 }}>
              Recalcular trechos
            </button>

            <button onClick={otimizarParadas} disabled={paradasLoading} style={{ ...btn, background: '#f97316', color: '#1e293b', opacity: paradasLoading ? 0.7 : 1 }}>
              Otimizar ordem (km)
            </button>

            <button onClick={oneClickGerarRotaEAbrirScan} disabled={paradasLoading || oneClickLoading} style={{ ...btn, background: '#1A4A1A', color: 'white', padding: '8px 14px', opacity: paradasLoading || oneClickLoading ? 0.7 : 1 }} title="Gera/normaliza a rota do planejamento (resetando status das paradas) e abre a tela /scan já com rotaId">
              {oneClickLoading ? 'Preparando…' : '1 clique: gerar rota + abrir /scan'}
            </button>

            {oneClickMsg && <span style={{ alignSelf: 'center', color: '#16a34a', fontSize: 13 }}>{oneClickMsg}</span>}
          </div>

          {(paradasError || paradasInfo) && (
            <div style={{ marginTop: 10 }}>
              {paradasError && <div style={{ color: '#b91c1c' }}>{paradasError}</div>}
              {paradasInfo && <div style={{ color: '#16a34a' }}>{paradasInfo}</div>}
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#ffffff' }}>
              <thead>
                <tr>
                  <th style={th}>#</th>
                  <th style={th}>Label</th>
                  <th style={th}>NF</th>
                  <th style={th}>Valor NF</th>
                  <th style={th}>% Frete</th>
                  <th style={th}>Frete (R$)</th>
                  <th style={th}>Km (trecho)</th>
                  <th style={th}>Min (trecho)</th>
                  <th style={th}>Status</th>
                  <th style={th}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {paradas.map((p, idx) => {
                  const coleta = (p as any).Coleta;
                  const pctFrete = coleta?.Cliente?.percentualFrete ?? null;
                  const valorNf = coleta?.valorFrete ?? null;
                  const freteCalc = pctFrete != null && valorNf != null ? valorNf * (pctFrete / 100) : null;
                  return (
                  <tr key={p.id}>
                    <td style={{ ...td, width: 40 }}>{idx + 1}</td>
                    <td style={td}>{p.label}</td>
                    <td style={td}>{coleta?.nf ?? '-'}</td>
                    <td style={tdNum}>{valorNf != null ? Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorNf) : '-'}</td>
                    <td style={tdNum}>{pctFrete != null ? `${pctFrete}%` : '-'}</td>
                    <td style={tdNum}>{freteCalc != null ? Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(freteCalc) : '-'}</td>
                    <td style={tdNum}>{p.kmTrecho != null ? p.kmTrecho.toFixed(2) : '-'}</td>
                    <td style={tdNum}>{p.durMinTrecho != null ? p.durMinTrecho : '-'}</td>
                    <td style={td}>{p.statusExec ?? 'PENDENTE'}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => reordenarIndice(idx, -1)} disabled={paradasLoading || idx === 0} style={{ ...btn, background: '#0ea5e9', color: '#1e293b', opacity: paradasLoading || idx === 0 ? 0.6 : 1 }} title="Mover para cima">
                          ↑
                        </button>
                        <button onClick={() => reordenarIndice(idx, +1)} disabled={paradasLoading || idx === paradas.length - 1} style={{ ...btn, background: '#0ea5e9', color: '#1e293b', opacity: paradasLoading || idx === paradas.length - 1 ? 0.6 : 1 }} title="Mover para baixo">
                          ↓
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {paradas.length === 0 && (
                  <tr>
                    <td style={td} colSpan={10}>
                      (Sem paradas vinculadas ainda)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 16, borderTop: '1px dashed #e2e8f0', paddingTop: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Editar parada (PATCH)</h3>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr 1fr 1fr', maxWidth: 1000 }}>
              <label style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={labelStyle}>paradaId</span>
                <input value={editParadaId} onChange={(e) => setEditParadaId(e.target.value)} style={inputStyle} placeholder="Cole o ID da tabela acima" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={labelStyle}>Novo label</span>
                <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} style={inputStyle} placeholder='Ex.: "São Paulo, SP, Brasil"' />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={labelStyle}>lon</span>
                <input value={editLon} onChange={(e) => setEditLon(e.target.value)} style={inputStyle} placeholder="-46.633309" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={labelStyle}>lat</span>
                <input value={editLat} onChange={(e) => setEditLat(e.target.value)} style={inputStyle} placeholder="-23.550520" />
              </label>
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button onClick={patchParada} disabled={editLoading} style={{ ...btn, background: '#f59e0b', color: '#1e293b', opacity: editLoading ? 0.7 : 1 }}>
                {editLoading ? 'Salvando…' : 'Salvar alterações'}
              </button>
              {editMsg && <div style={{ alignSelf: 'center', color: '#16a34a' }}>{editMsg}</div>}
            </div>
          </div>
        </div>
      )}

      {/* MAPA */}
      <div style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8, color: '#1A4A1A' }}>Mapa</h2>
        <div style={{ height: 480, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: '#ffffff' }}>
          {mapPoints.length > 0 && <LeafletMap points={mapPoints} lines={mapLines} />}
        </div>
      </div>
    </div>
  );
}