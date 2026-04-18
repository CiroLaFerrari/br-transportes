'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────────────────────

type Box = {
  itemId: string;
  coletaId: string;
  coletaNF: string | null;
  produtoCode: string;
  produtoDescricao: string;
  quantidade: number;
  alturaCm: number | null;
  larguraCm: number | null;
  comprimentoCm: number | null;
  volumeM3Unit: number | null;
  volumeM3Total: number | null;
  fragil: boolean;
  empilhavel: boolean;
  posicao: string | null;
  desmontavel: boolean;
  tipoEmbalagem: string | null;
};

type VeiculoInfo = { placa: string; compCm: number; largCm: number; altCm: number };

type PlacedBox = {
  box: Box;
  x: number; y: number; w: number; h: number;
  color: string;
  label: string;
  overflow: boolean;   // placed outside truck bounds
  rotated: boolean;    // was rotated to fit
  unitIdx: number;     // which unit of this item (when qty > 1)
};

// ── Constants ────────────────────────────────────────────────────────────────

const COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed',
  '#db2777', '#0891b2', '#ea580c', '#0d9488', '#a855f7',
  '#059669', '#e11d48', '#0284c7', '#65a30d', '#c026d3',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getColor(idx: number) { return COLORS[idx % COLORS.length]; }

/**
 * Normalise one dimension: if null/0/negative fall back to `fallback`.
 * `fallback` is derived from the other two dimensions or a default.
 */
function normDim(v: number | null | undefined, fallback: number): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Shelf-based strip packing.
 * dimW / dimH = how each box maps to (width, height) in this view.
 * Truck is truckW × truckL (in this view).
 */
function shelfPack(
  units: { box: Box; color: string; label: string; unitIdx: number }[],
  truckW: number,
  truckL: number,
  dimW: (b: Box) => number,
  dimH: (b: Box) => number,
): PlacedBox[] {
  const placed: PlacedBox[] = [];
  let shelfX = 0, shelfY = 0, shelfH = 0;

  for (const { box, color, label, unitIdx } of units) {
    let w = Math.min(dimW(box), truckW);
    let h = dimH(box);
    let rotated = false;

    // Try rotating if item overflows shelf width
    if (shelfX + w > truckW) {
      const rw = Math.min(h, truckW);
      const rh = w;
      if (shelfX === 0 || shelfX + rw <= truckW) {
        w = rw; h = rh; rotated = true;
      } else {
        // New shelf
        shelfY += shelfH; shelfX = 0; shelfH = 0;
        // Retry with original dims
        w = Math.min(dimW(box), truckW); h = dimH(box); rotated = false;
        if (w > truckW) { w = truckW; }
      }
    }

    const overflow = shelfY + h > truckL;

    placed.push({ box, x: shelfX, y: shelfY, w, h, color, label, overflow, rotated, unitIdx });

    shelfX += w;
    if (h > shelfH) shelfH = h;
  }

  return placed;
}

function buildUnits(
  boxes: Box[],
  coletaColorMap: Map<string, string>,
) {
  const units: { box: Box; color: string; label: string; unitIdx: number }[] = [];
  for (const box of boxes) {
    const color = coletaColorMap.get(box.coletaId) ?? '#666';
    const lbl = box.produtoCode.length > 14 ? box.produtoCode.slice(0, 13) + '…' : box.produtoCode;
    for (let q = 0; q < Math.max(1, box.quantidade); q++) {
      units.push({ box, color, label: lbl, unitIdx: q });
    }
  }
  return units;
}

// ── SVG View Component ────────────────────────────────────────────────────────

type ViewLabel = { viewW: number; viewL: number; labelW: string; labelL: string };

function CargaView({
  title,
  placed,
  viewW,    // truck dimension for x-axis (cm)
  viewL,    // truck dimension for y-axis (cm)
  labelW,
  labelL,
  hoveredKey,
  setHoveredKey,
}: {
  title: string;
  placed: PlacedBox[];
  viewW: number; viewL: number;
  labelW: string; labelL: string;
  hoveredKey: string | null;
  setHoveredKey: (k: string | null) => void;
}) {
  const maxY = placed.reduce((m, b) => Math.max(m, b.y + b.h), 0);
  const displayL = Math.max(viewL, maxY + 5);
  const svgW = 420;
  const scale = svgW / viewW;
  const svgPad = { top: 32, right: 16, bottom: 28, left: 24 };
  const svgH = Math.min(displayL * scale + svgPad.top + svgPad.bottom, 820);

  const px = (x: number) => svgPad.left + x * scale;
  const py = (y: number) => svgPad.top + y * scale;

  const gridStep = viewW > 600 ? 200 : viewW > 200 ? 100 : 50;

  return (
    <div style={{ flex: '1 1 440px', minWidth: 300 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#1A4A1A', textTransform: 'uppercase',
        letterSpacing: '0.8px', marginBottom: 8, padding: '4px 8px',
        background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, display: 'inline-block' }}>
        {title}
      </div>
      <div style={{ overflowY: 'auto', maxHeight: 860, border: '1px solid #e2e8f0',
        borderRadius: 10, background: '#fafbfc' }}>
        <svg
          width={svgW + svgPad.left + svgPad.right}
          height={svgH}
          style={{ display: 'block' }}
        >
          {/* Grid */}
          {Array.from({ length: Math.floor(viewW / gridStep) + 1 }).map((_, i) => (
            <line key={`gv${i}`}
              x1={px(i * gridStep)} y1={svgPad.top}
              x2={px(i * gridStep)} y2={py(displayL)}
              stroke="#e2e8f0" strokeWidth={0.5} />
          ))}
          {Array.from({ length: Math.floor(displayL / gridStep) + 1 }).map((_, i) => (
            <line key={`gh${i}`}
              x1={px(0)} y1={py(i * gridStep)}
              x2={px(viewW)} y2={py(i * gridStep)}
              stroke="#e2e8f0" strokeWidth={0.5} />
          ))}

          {/* Overflow zone (beyond truck bounds) */}
          {displayL > viewL && (
            <rect x={px(0)} y={py(viewL)} width={viewW * scale} height={(displayL - viewL) * scale}
              fill="url(#overflow)" opacity={0.3} />
          )}
          <defs>
            <pattern id="overflow" patternUnits="userSpaceOnUse" width={10} height={10}>
              <path d="M-1,1 l2,-2 M0,10 l10,-10 M9,11 l2,-2" stroke="#f97316" strokeWidth={1} />
            </pattern>
          </defs>

          {/* Truck outline */}
          <rect x={px(0)} y={py(0)} width={viewW * scale} height={viewL * scale}
            fill="none" stroke="#64748b" strokeWidth={2} rx={3} />

          {/* Cab strip */}
          <rect x={px(viewW * 0.15)} y={svgPad.top - 22}
            width={viewW * scale * 0.7} height={20}
            fill="#1A4A1A" rx={4} />
          <text x={px(viewW / 2)} y={svgPad.top - 9}
            textAnchor="middle" fill="#fff" fontSize={9} fontWeight={700}>CABINE</text>

          {/* Dimension labels */}
          <text x={px(viewW / 2)} y={py(displayL) + 16}
            textAnchor="middle" fill="#94a3b8" fontSize={9}>{viewW} cm · {labelW}</text>
          <text x={svgPad.left - 8} y={py(viewL / 2)}
            textAnchor="middle" fill="#94a3b8" fontSize={9}
            transform={`rotate(-90,${svgPad.left - 8},${py(viewL / 2)})`}>{viewL} cm</text>

          {/* Boxes */}
          {placed.map((b, i) => {
            const key = `${b.box.itemId}-${b.unitIdx}`;
            const isHov = hoveredKey === key;
            return (
              <g key={key}
                onMouseEnter={() => setHoveredKey(key)}
                onMouseLeave={() => setHoveredKey(null)}
                style={{ cursor: 'pointer' }}>
                <rect
                  x={px(b.x)} y={py(b.y)}
                  width={Math.max(b.w * scale, 2)} height={Math.max(b.h * scale, 2)}
                  fill={b.color + (isHov ? 'bb' : '44')}
                  stroke={b.overflow ? '#f97316' : b.color}
                  strokeWidth={isHov ? 2.5 : b.overflow ? 1.5 : 1.5}
                  strokeDasharray={b.overflow ? '4,2' : undefined}
                  rx={2}
                />
                {/* Fragile icon */}
                {b.box.fragil && b.w * scale > 14 && b.h * scale > 14 && (
                  <text x={px(b.x) + 3} y={py(b.y) + 12} fill="#dc2626" fontSize={10} fontWeight={800}>⚠</text>
                )}
                {/* FRONTAL badge */}
                {b.box.posicao === 'FRONTAL' && b.w * scale > 20 && (
                  <rect x={px(b.x)} y={py(b.y)} width={Math.min(b.w * scale, 20)} height={6}
                    fill="#2563eb" rx={0} />
                )}
                {/* Label */}
                {b.w * scale > 38 && b.h * scale > 16 && (
                  <text
                    x={px(b.x + b.w / 2)} y={py(b.y + b.h / 2)}
                    textAnchor="middle" dominantBaseline="central"
                    fill={b.color} fontSize={Math.max(7, Math.min(10, b.w * scale * 0.1))}
                    fontWeight={700}>
                    {b.label}
                  </text>
                )}
                {/* Dims inside box if big enough */}
                {b.w * scale > 50 && b.h * scale > 28 && (
                  <text
                    x={px(b.x + b.w / 2)} y={py(b.y + b.h / 2) + 11}
                    textAnchor="middle" dominantBaseline="central"
                    fill="#94a3b8" fontSize={7}>
                    {Math.round(b.w)}×{Math.round(b.h)}cm
                  </text>
                )}
                {/* Rotation marker */}
                {b.rotated && b.w * scale > 16 && b.h * scale > 16 && (
                  <text x={px(b.x + b.w) - 4} y={py(b.y) + 11}
                    textAnchor="end" fill="#7c3aed" fontSize={9}>↻</text>
                )}
                {/* Unit number when qty > 1 */}
                {b.box.quantidade > 1 && b.w * scale > 18 && b.h * scale > 18 && (
                  <text x={px(b.x) + 4} y={py(b.y + b.h) - 4}
                    fill={b.color} fontSize={8} fontWeight={700}>#{b.unitIdx + 1}</text>
                )}
              </g>
            );
          })}

          {/* Overflow label */}
          {placed.some(b => b.overflow) && (
            <text x={px(viewW / 2)} y={py(viewL) + 10}
              textAnchor="middle" fill="#f97316" fontSize={9} fontWeight={600}>
              ⚠ Itens excedentes fora do limite
            </text>
          )}
        </svg>
      </div>

      {/* Dimension axis label */}
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, textAlign: 'center' }}>
        ← {labelW} ({viewW} cm) → &nbsp;|&nbsp; ↕ {labelL} ({viewL} cm)
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CargaLayoutPage() {
  const params = useParams();
  const id = String(params?.id || '');

  const [boxes, setBoxes] = useState<Box[]>([]);
  const [veiculo, setVeiculo] = useState<VeiculoInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planName, setPlanName] = useState('');
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  useEffect(() => { if (id) load(); }, [id]);

  async function load() {
    try {
      setLoading(true); setError(null);
      const [layoutRes, planRes] = await Promise.all([
        fetch(`/api/planejamentos/${id}/carga/layout`),
        fetch(`/api/planejamentos/${id}`),
      ]);
      const layoutJ = await layoutRes.json().catch(() => null);
      const planJ = await planRes.json().catch(() => null);
      if (!layoutRes.ok) throw new Error(layoutJ?.error || 'Falha ao carregar layout');
      setBoxes(layoutJ?.boxes || []);
      const p = planJ?.planejamento || planJ;
      setPlanName(p?.name || '');
      const veiculoId = p?.veiculoId;
      if (veiculoId) {
        const vRes = await fetch(`/api/veiculos/${veiculoId}`);
        const vJ = await vRes.json().catch(() => null);
        if (vRes.ok && vJ) {
          const v = vJ.veiculo || vJ;
          setVeiculo({ placa: v.placa || '', compCm: +v.compCm || 0, largCm: +v.largCm || 0, altCm: +v.altCm || 0 });
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Erro');
    } finally {
      setLoading(false);
    }
  }

  // Truck dimensions — fallback to a realistic default if not set
  const truckLarg = veiculo?.largCm || 250;    // width
  const truckComp = veiculo?.compCm || 1400;   // length
  const truckAlt  = veiculo?.altCm  || 200;    // height

  // Build colour map per coleta
  const coletaColorMap = new Map<string, string>();
  let ci = 0;
  for (const b of boxes) {
    if (!coletaColorMap.has(b.coletaId)) coletaColorMap.set(b.coletaId, getColor(ci++));
  }

  // Normalise dimensions per box for each view
  function topW(b: Box): number {
    return normDim(b.larguraCm,
      normDim(b.comprimentoCm, normDim(b.alturaCm, 60)) * 0.6);
  }
  function topH(b: Box): number {
    return normDim(b.comprimentoCm,
      normDim(b.larguraCm, normDim(b.alturaCm, 60)) * 0.6);
  }
  function sideW(b: Box): number {
    return normDim(b.comprimentoCm,
      normDim(b.larguraCm, normDim(b.alturaCm, 60)) * 0.8);
  }
  function sideH(b: Box): number {
    return normDim(b.alturaCm,
      normDim(b.larguraCm, normDim(b.comprimentoCm, 60)) * 0.5);
  }

  // Sort: FRONTAL first, then biggest area
  const sorted = [...boxes].sort((a, b) => {
    const pa = a.posicao === 'FRONTAL' ? 0 : 1;
    const pb = b.posicao === 'FRONTAL' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return (topW(b) * topH(b)) - (topW(a) * topH(a));
  });

  const units = buildUnits(sorted, coletaColorMap);

  const topPlaced  = shelfPack(units, truckLarg, truckComp, topW, topH);
  const sidePlaced = shelfPack(units, truckComp, truckAlt,  sideW, sideH);

  // Stats
  const totalVol   = boxes.reduce((s, b) => s + (b.volumeM3Total || 0), 0);
  const totalItems = boxes.reduce((s, b) => s + (b.quantidade || 1), 0);
  const truckVolM3 = veiculo
    ? (veiculo.compCm * veiculo.largCm * veiculo.altCm) / 1_000_000 : null;
  const occupancy  = truckVolM3 && truckVolM3 > 0
    ? Math.min((totalVol / truckVolM3) * 100, 100) : null;
  const overflowCount = topPlaced.filter(b => b.overflow).length;

  // Hover info
  const hovBox = hoveredKey
    ? topPlaced.find(b => `${b.box.itemId}-${b.unitIdx}` === hoveredKey)
      || sidePlaced.find(b => `${b.box.itemId}-${b.unitIdx}` === hoveredKey)
    : null;

  // Shared styles
  const card: React.CSSProperties = {
    padding: '10px 14px', border: '1px solid #e2e8f0', background: '#fff',
    borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', fontSize: 14,
  };
  const th: React.CSSProperties = {
    textAlign: 'left', padding: '9px 12px', borderBottom: '2px solid #1A4A1A',
    background: '#f0fdf0', fontWeight: 700, color: '#1A4A1A',
    fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px',
  };
  const td: React.CSSProperties = {
    padding: '8px 12px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: 13,
  };

  return (
    <div style={{ padding: '20px 24px', color: '#1e293b', minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <Link href="/planejamento" style={{ color: '#1A4A1A', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
          Planejamento
        </Link>
        <span style={{ opacity: 0.4 }}>/</span>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0, color: '#1A4A1A' }}>
          Layout de Carga{planName ? ` — ${planName}` : ''}
        </h1>
      </div>

      {error && (
        <div style={{ color: '#dc2626', marginBottom: 12, padding: '10px 14px',
          background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', fontSize: 13 }}>
          {error}
        </div>
      )}
      {loading && <div style={{ padding: 20, color: '#64748b' }}>Carregando...</div>}

      {!loading && (
        <>
          {/* KPI cards */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            {veiculo && (
              <div style={card}>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Veículo</div>
                <div style={{ fontWeight: 800, color: '#1A4A1A', fontSize: 15 }}>{veiculo.placa}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{truckComp} × {truckLarg} × {truckAlt} cm</div>
              </div>
            )}
            <div style={card}>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Itens</div>
              <div style={{ fontWeight: 800, color: '#1A4A1A', fontSize: 20 }}>{totalItems}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Volume Total</div>
              <div style={{ fontWeight: 800, color: '#1A4A1A', fontSize: 20 }}>{totalVol.toFixed(3)} m³</div>
            </div>
            {occupancy !== null && (
              <div style={{ ...card, borderLeft: `4px solid ${occupancy > 90 ? '#dc2626' : occupancy > 70 ? '#d97706' : '#16a34a'}` }}>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Ocupação</div>
                <div style={{ fontWeight: 800, fontSize: 20, color: occupancy > 90 ? '#dc2626' : occupancy > 70 ? '#d97706' : '#16a34a' }}>
                  {occupancy.toFixed(1)}%
                </div>
              </div>
            )}
            {overflowCount > 0 && (
              <div style={{ ...card, background: '#fff7ed', border: '1px solid #fed7aa' }}>
                <div style={{ fontSize: 10, color: '#92400e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>⚠ Excede Veículo</div>
                <div style={{ fontWeight: 700, color: '#f97316', fontSize: 14 }}>
                  {overflowCount} unid. não cabem
                </div>
                <div style={{ fontSize: 11, color: '#92400e' }}>Verificar dimensões</div>
              </div>
            )}
            {!veiculo && (
              <div style={{ ...card, background: '#fffbeb', border: '1px solid #F5BE16', color: '#92400e' }}>
                <div style={{ fontSize: 12 }}>Sem veículo vinculado — usando medidas padrão</div>
              </div>
            )}
          </div>

          {/* Hover tooltip */}
          {hovBox && (
            <div style={{ marginBottom: 10, padding: '8px 14px', background: '#f0fdf0',
              border: '1px solid #86efac', borderRadius: 8, fontSize: 12, color: '#166534',
              display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span><b>{hovBox.box.produtoCode}</b></span>
              <span>{hovBox.box.produtoDescricao}</span>
              <span>L {normDim(hovBox.box.larguraCm, 0)} × A {normDim(hovBox.box.alturaCm, 0)} × C {normDim(hovBox.box.comprimentoCm, 0)} cm</span>
              {hovBox.box.volumeM3Unit != null && <span>Vol: {hovBox.box.volumeM3Unit.toFixed(4)} m³/un</span>}
              {hovBox.box.fragil && <span style={{ color: '#dc2626', fontWeight: 700 }}>⚠ FRÁGIL</span>}
              {hovBox.box.posicao === 'FRONTAL' && <span style={{ color: '#2563eb', fontWeight: 700 }}>FRONTAL</span>}
              {hovBox.rotated && <span style={{ color: '#7c3aed' }}>↻ Rotacionado</span>}
              {hovBox.overflow && <span style={{ color: '#f97316', fontWeight: 700 }}>⚠ Fora do limite</span>}
            </div>
          )}

          {/* Two views */}
          {boxes.length > 0 ? (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
              padding: 20, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>

              {/* Legend */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', alignSelf: 'center' }}>
                  NFs:
                </div>
                {Array.from(coletaColorMap.entries()).map(([cid, color]) => {
                  const nf = boxes.find(b => b.coletaId === cid)?.coletaNF || cid.slice(0, 8);
                  return (
                    <div key={cid} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                      <div style={{ width: 16, height: 16, background: color + '44', border: `2.5px solid ${color}`, borderRadius: 3 }} />
                      <span style={{ fontWeight: 600 }}>NF {nf}</span>
                    </div>
                  );
                })}
                <div style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center', marginLeft: 8 }}>
                  ╌╌ linha tracejada = excede veículo &nbsp;|&nbsp; ⚠ frágil &nbsp;|&nbsp; ↻ rotacionado &nbsp;|&nbsp; <span style={{ color: '#2563eb' }}>▌</span> frontal
                </div>
              </div>

              {/* Views container */}
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <CargaView
                  title="Vista de Cima (planta baixa)"
                  placed={topPlaced}
                  viewW={truckLarg}
                  viewL={truckComp}
                  labelW="Largura"
                  labelL="Comprimento"
                  hoveredKey={hoveredKey}
                  setHoveredKey={setHoveredKey}
                />
                <CargaView
                  title="Vista Lateral (perfil)"
                  placed={sidePlaced}
                  viewW={truckComp}
                  viewL={truckAlt}
                  labelW="Comprimento"
                  labelL="Altura"
                  hoveredKey={hoveredKey}
                  setHoveredKey={setHoveredKey}
                />
              </div>

              {/* Scale note */}
              <div style={{ marginTop: 12, fontSize: 11, color: '#94a3b8' }}>
                Nota: posicionamento é estimado para visualização. Itens podem ser rotacionados (↻) para melhor aproveitamento.
                A IA de organização de carga usará estas dimensões para calcular o arranjo ótimo.
              </div>
            </div>
          ) : (
            <div style={{ padding: 32, color: '#94a3b8', background: '#fff', borderRadius: 12,
              border: '1px solid #e2e8f0', textAlign: 'center', marginBottom: 20 }}>
              Nenhum item de carga encontrado para este planejamento.
            </div>
          )}

          {/* Items detail table */}
          {boxes.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
              overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0',
                display: 'flex', alignItems: 'center', gap: 12 }}>
                <h3 style={{ fontSize: 13, fontWeight: 800, color: '#1A4A1A', margin: 0,
                  textTransform: 'uppercase', letterSpacing: '0.5px' }}>Detalhamento de Itens</h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>NF</th>
                      <th style={th}>Código</th>
                      <th style={th}>Descrição</th>
                      <th style={{ ...th, textAlign: 'center' }}>Qtd</th>
                      <th style={{ ...th, textAlign: 'right' }}>Larg cm</th>
                      <th style={{ ...th, textAlign: 'right' }}>Alt cm</th>
                      <th style={{ ...th, textAlign: 'right' }}>Comp cm</th>
                      <th style={{ ...th, textAlign: 'right' }}>Vol. (m³)</th>
                      <th style={th}>Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boxes.map((b, i) => (
                      <tr key={b.itemId} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafb' }}>
                        <td style={{ ...td, fontWeight: 600, color: coletaColorMap.get(b.coletaId) }}>{b.coletaNF || '-'}</td>
                        <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{b.produtoCode}</td>
                        <td style={td}>{b.produtoDescricao}</td>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{b.quantidade}</td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: !b.larguraCm ? '#f97316' : undefined }}>
                          {b.larguraCm ?? <span title="Dimensão não cadastrada" style={{ color: '#f97316' }}>—</span>}
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: !b.alturaCm ? '#f97316' : undefined }}>
                          {b.alturaCm ?? <span title="Dimensão não cadastrada" style={{ color: '#f97316' }}>—</span>}
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: !b.comprimentoCm ? '#f97316' : undefined }}>
                          {b.comprimentoCm ?? <span title="Dimensão não cadastrada" style={{ color: '#f97316' }}>—</span>}
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                          {b.volumeM3Total != null ? b.volumeM3Total.toFixed(4) : '—'}
                        </td>
                        <td style={td}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {b.fragil && <span style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>⚠ Frágil</span>}
                            {!b.empilhavel && <span style={{ background: '#fef9c3', color: '#92400e', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>Não empilhável</span>}
                            {b.posicao === 'FRONTAL' && <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>Frontal</span>}
                            {b.desmontavel && <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>Desmontável</span>}
                            {b.tipoEmbalagem && <span style={{ background: '#f5f3ff', color: '#7c3aed', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{b.tipoEmbalagem}</span>}
                            {(!b.larguraCm || !b.alturaCm || !b.comprimentoCm) && (
                              <span style={{ background: '#fff7ed', color: '#f97316', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>Dim. incompleta</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
