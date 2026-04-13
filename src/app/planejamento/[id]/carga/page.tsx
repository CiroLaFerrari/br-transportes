'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

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

type VeiculoInfo = {
  placa: string;
  compCm: number;
  largCm: number;
  altCm: number;
};

const COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed',
  '#db2777', '#0891b2', '#ea580c', '#0d9488', '#a855f7',
  '#475569', '#e11d48', '#0284c7', '#65a30d', '#c026d3',
];

function getColor(index: number) {
  return COLORS[index % COLORS.length];
}

export default function CargaLayoutPage() {
  const params = useParams();
  const id = String(params?.id || '');

  const [boxes, setBoxes] = useState<Box[]>([]);
  const [veiculo, setVeiculo] = useState<VeiculoInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planName, setPlanName] = useState('');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const [layoutRes, planRes] = await Promise.all([
        fetch(`/api/planejamentos/${id}/carga/layout`),
        fetch(`/api/planejamentos/${id}`),
      ]);

      const layoutJ = await layoutRes.json().catch(() => null);
      const planJ = await planRes.json().catch(() => null);

      if (!layoutRes.ok) throw new Error(layoutJ?.error || 'Falha ao carregar layout');

      setBoxes(layoutJ?.boxes || []);
      setPlanName(planJ?.name || planJ?.planejamento?.name || '');

      // Try to load vehicle
      const veiculoId = planJ?.veiculoId || planJ?.planejamento?.veiculoId;
      if (veiculoId) {
        const vRes = await fetch(`/api/veiculos/${veiculoId}`);
        const vJ = await vRes.json().catch(() => null);
        if (vRes.ok && vJ) {
          const v = vJ.veiculo || vJ;
          setVeiculo({
            placa: v.placa || '',
            compCm: Number(v.compCm || 0),
            largCm: Number(v.largCm || 0),
            altCm: Number(v.altCm || 0),
          });
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Erro');
    } finally {
      setLoading(false);
    }
  }

  // Layout computation
  const truckW = veiculo?.largCm || 250;
  const truckL = veiculo?.compCm || 1400;

  type PlacedBox = Box & { x: number; y: number; w: number; h: number; color: string; idx: number; label: string };

  function computeLayout(): PlacedBox[] {
    // Expand boxes by quantity and sort: FRONTAL first, then by area descending
    const expanded: { box: Box; color: string; sortKey: number }[] = [];
    let colorIdx = 0;
    const coletaColorMap = new Map<string, string>();

    for (const box of boxes) {
      if (!coletaColorMap.has(box.coletaId)) {
        coletaColorMap.set(box.coletaId, getColor(colorIdx++));
      }
      const color = coletaColorMap.get(box.coletaId) || '#666';
      const qty = box.quantidade || 1;
      for (let q = 0; q < qty; q++) {
        expanded.push({ box, color, sortKey: 0 });
      }
    }

    // Sort: FRONTAL first, then largest items first (better packing)
    expanded.sort((a, b) => {
      const pa = a.box.posicao === 'FRONTAL' ? 0 : 1;
      const pb = b.box.posicao === 'FRONTAL' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const aW = a.box.larguraCm || 60;
      const aH = a.box.comprimentoCm || 60;
      const bW = b.box.larguraCm || 60;
      const bH = b.box.comprimentoCm || 60;
      return (bW * bH) - (aW * aH);
    });

    const placed: PlacedBox[] = [];

    // Shelf-based strip packing (top-view: x=width, y=length from front)
    let shelfY = 0;
    let shelfX = 0;
    let shelfH = 0;

    for (const { box, color } of expanded) {
      // Use real dimensions, with sensible defaults for missing values
      let w = box.larguraCm || 60;
      let h = box.comprimentoCm || 60;

      // If width is 0 or very small, derive from other dimensions or use default
      if (w < 5) w = box.alturaCm && box.alturaCm > 5 ? Math.min(box.alturaCm, truckW) : 60;
      if (h < 5) h = box.alturaCm && box.alturaCm > 5 ? Math.min(box.alturaCm, 120) : 60;

      // Clamp to truck dimensions
      w = Math.min(w, truckW);
      h = Math.min(h, truckL);

      // Try to fit; if doesn't fit horizontally, try rotating
      if (shelfX + w > truckW) {
        // Try rotated (swap w and h)
        if (shelfX + h <= truckW && h <= truckW) {
          const tmp = w;
          w = h;
          h = tmp;
        } else {
          // New shelf
          shelfY += shelfH;
          shelfX = 0;
          shelfH = 0;
        }
      }

      placed.push({
        ...box,
        x: shelfX,
        y: shelfY,
        w,
        h,
        color,
        idx: placed.length,
        label: box.produtoCode.length > 14 ? box.produtoCode.slice(0, 12) + '..' : box.produtoCode,
      });

      shelfX += w;
      if (h > shelfH) shelfH = h;
    }

    return placed;
  }

  const placedBoxes = computeLayout();

  // Calculate actual used area
  const maxY = placedBoxes.reduce((m, b) => Math.max(m, b.y + b.h), 0);
  const displayTruckL = Math.max(truckL, maxY + 20);

  // SVG sizing — fit to a nice width, scale proportionally
  const svgTargetW = 500;
  const scale = svgTargetW / truckW;
  const svgPad = 40;
  const svgW = truckW * scale + svgPad * 2;
  const svgH = Math.min(displayTruckL * scale + svgPad * 2, 900);

  const totalVol = boxes.reduce((acc, b) => acc + (b.volumeM3Total || 0), 0);
  const totalItems = boxes.reduce((acc, b) => acc + (b.quantidade || 1), 0);
  const truckVolM3 = veiculo ? (veiculo.compCm * veiculo.largCm * veiculo.altCm) / 1_000_000 : null;
  const occupancy = truckVolM3 && truckVolM3 > 0 ? Math.min((totalVol / truckVolM3) * 100, 100) : null;

  // Styles
  const cardStyle: React.CSSProperties = {
    padding: '12px 16px',
    border: '1px solid #e2e8f0',
    background: '#ffffff',
    borderRadius: 10,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    fontSize: 14,
  };

  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '10px 12px',
    borderBottom: '2px solid #1A4A1A',
    background: '#f0fdf0',
    fontWeight: 700,
    color: '#1A4A1A',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  const td: React.CSSProperties = {
    padding: '8px 12px',
    borderBottom: '1px solid #f1f5f9',
    color: '#334155',
    fontSize: 13,
  };

  return (
    <div style={{ padding: '20px 24px', color: '#1e293b', minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
        <Link href="/planejamento" style={{ color: '#1A4A1A', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
          Planejamento
        </Link>
        <span style={{ opacity: 0.4, fontSize: 14 }}>/</span>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0, color: '#1A4A1A' }}>
          Layout de Carga {planName ? `\u2014 ${planName}` : ''}
        </h1>
      </div>

      {error && (
        <div style={{ color: '#dc2626', marginBottom: 12, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', fontSize: 13 }}>
          {error}
        </div>
      )}
      {loading && <div style={{ padding: 20, color: '#64748b' }}>Carregando...</div>}

      {!loading && (
        <>
          {/* Info Cards */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            {veiculo && (
              <div style={cardStyle}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Veículo</div>
                <div style={{ fontWeight: 700, color: '#1A4A1A' }}>{veiculo.placa}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{veiculo.compCm} × {veiculo.largCm} × {veiculo.altCm} cm</div>
              </div>
            )}
            <div style={cardStyle}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Itens</div>
              <div style={{ fontWeight: 700, color: '#1A4A1A', fontSize: 18 }}>{totalItems}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Volume Total</div>
              <div style={{ fontWeight: 700, color: '#1A4A1A', fontSize: 18 }}>{totalVol.toFixed(3)} m³</div>
            </div>
            {occupancy !== null && (
              <div style={cardStyle}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Ocupação</div>
                <div style={{ fontWeight: 700, color: occupancy > 90 ? '#dc2626' : occupancy > 70 ? '#d97706' : '#16a34a', fontSize: 18 }}>{occupancy.toFixed(1)}%</div>
              </div>
            )}
            {!veiculo && (
              <div style={{ ...cardStyle, border: '1px solid #F5BE16', background: '#fffbeb', color: '#92400e' }}>
                <div style={{ fontSize: 12 }}>Nenhum veículo vinculado — usando dimensões padrão ({truckW}×{truckL} cm)</div>
              </div>
            )}
          </div>

          {/* SVG Layout */}
          {boxes.length > 0 ? (
            <div style={{ marginBottom: 24, background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 13, marginBottom: 10, color: '#64748b', fontWeight: 600 }}>
                Vista superior (frente do veículo = topo)
              </div>
              <div style={{ overflow: 'auto' }}>
                <svg width={svgW} height={svgH} style={{ background: '#fafbfc' }}>
                  {/* Grid lines */}
                  {Array.from({ length: Math.floor(truckW / 50) + 1 }).map((_, i) => (
                    <line key={`gv${i}`} x1={svgPad + i * 50 * scale} y1={svgPad} x2={svgPad + i * 50 * scale} y2={svgPad + displayTruckL * scale} stroke="#e2e8f0" strokeWidth={0.5} />
                  ))}
                  {Array.from({ length: Math.floor(displayTruckL / 100) + 1 }).map((_, i) => (
                    <line key={`gh${i}`} x1={svgPad} y1={svgPad + i * 100 * scale} x2={svgPad + truckW * scale} y2={svgPad + i * 100 * scale} stroke="#e2e8f0" strokeWidth={0.5} />
                  ))}

                  {/* Truck outline */}
                  <rect
                    x={svgPad}
                    y={svgPad}
                    width={truckW * scale}
                    height={displayTruckL * scale}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    rx={4}
                  />

                  {/* Cab indicator */}
                  <rect
                    x={svgPad + truckW * scale * 0.15}
                    y={svgPad - 18}
                    width={truckW * scale * 0.7}
                    height={16}
                    fill="#1A4A1A"
                    rx={4}
                  />
                  <text
                    x={svgPad + truckW * scale * 0.5}
                    y={svgPad - 7}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize={9}
                    fontWeight={700}
                  >
                    CABINE
                  </text>

                  {/* Dimension labels */}
                  <text x={svgPad + truckW * scale / 2} y={svgPad + displayTruckL * scale + 16} textAnchor="middle" fill="#94a3b8" fontSize={10}>
                    {truckW} cm
                  </text>
                  <text x={svgPad - 8} y={svgPad + displayTruckL * scale / 2} textAnchor="middle" fill="#94a3b8" fontSize={10} transform={`rotate(-90, ${svgPad - 8}, ${svgPad + displayTruckL * scale / 2})`}>
                    {truckL} cm
                  </text>

                  {/* Placed boxes */}
                  {placedBoxes.map((b, i) => {
                    const isHovered = hoveredIdx === i;
                    return (
                      <g
                        key={i}
                        onMouseEnter={() => setHoveredIdx(i)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        style={{ cursor: 'pointer' }}
                      >
                        <rect
                          x={svgPad + b.x * scale}
                          y={svgPad + b.y * scale}
                          width={b.w * scale}
                          height={b.h * scale}
                          fill={b.color + (isHovered ? '88' : '33')}
                          stroke={b.color}
                          strokeWidth={isHovered ? 2.5 : 1.5}
                          rx={3}
                        />
                        {/* Fragile indicator */}
                        {b.fragil && (
                          <text
                            x={svgPad + b.x * scale + 4}
                            y={svgPad + b.y * scale + 13}
                            fill="#dc2626"
                            fontSize={11}
                            fontWeight={800}
                          >
                            ⚠
                          </text>
                        )}
                        {/* Product code label */}
                        {b.w * scale > 35 && b.h * scale > 18 && (
                          <text
                            x={svgPad + (b.x + b.w / 2) * scale}
                            y={svgPad + (b.y + b.h / 2) * scale}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill={b.color}
                            fontSize={Math.max(8, Math.min(11, b.w * scale * 0.12))}
                            fontWeight={700}
                          >
                            {b.label}
                          </text>
                        )}
                        {/* Dimensions inside box if big enough */}
                        {b.w * scale > 50 && b.h * scale > 30 && (
                          <text
                            x={svgPad + (b.x + b.w / 2) * scale}
                            y={svgPad + (b.y + b.h / 2) * scale + 12}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="#94a3b8"
                            fontSize={8}
                          >
                            {b.w}×{b.h}cm
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Hover tooltip */}
              {hoveredIdx !== null && placedBoxes[hoveredIdx] && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: '#f0fdf0', borderRadius: 8, border: '1px solid #bbf7d0', fontSize: 12, color: '#334155' }}>
                  <b>{placedBoxes[hoveredIdx].produtoCode}</b> — {placedBoxes[hoveredIdx].produtoDescricao}
                  {' | '}
                  {placedBoxes[hoveredIdx].w}×{placedBoxes[hoveredIdx].h} cm
                  {placedBoxes[hoveredIdx].volumeM3Unit ? ` | ${placedBoxes[hoveredIdx].volumeM3Unit!.toFixed(4)} m³` : ''}
                  {placedBoxes[hoveredIdx].fragil ? ' | FRÁGIL' : ''}
                  {placedBoxes[hoveredIdx].posicao === 'FRONTAL' ? ' | FRONTAL' : ''}
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: 24, color: '#94a3b8', background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', textAlign: 'center' }}>
              Nenhum item de carga encontrado para este planejamento.
            </div>
          )}

          {/* Legend by coleta */}
          {boxes.length > 0 && (
            <div style={{ marginBottom: 20, background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '14px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: '#1A4A1A', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Legenda (por NF/Coleta)</h3>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {(() => {
                  const seen = new Map<string, { nf: string; color: string }>();
                  for (const b of placedBoxes) {
                    if (!seen.has(b.coletaId)) {
                      seen.set(b.coletaId, { nf: b.coletaNF || b.coletaId.slice(0, 8), color: b.color });
                    }
                  }
                  return Array.from(seen.entries()).map(([cId, { nf, color }]) => (
                    <div key={cId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <div style={{ width: 18, height: 18, background: color + '44', border: `2px solid ${color}`, borderRadius: 4 }} />
                      <span style={{ fontWeight: 600 }}>NF {nf}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

          {/* Items table */}
          {boxes.length > 0 && (
            <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: 13, fontWeight: 800, color: '#1A4A1A', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Detalhamento de Itens</h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>NF</th>
                      <th style={th}>Código</th>
                      <th style={th}>Descrição</th>
                      <th style={{ ...th, textAlign: 'center' }}>Qtd</th>
                      <th style={{ ...th, textAlign: 'right' }}>Dimensões (cm)</th>
                      <th style={{ ...th, textAlign: 'right' }}>Vol. (m³)</th>
                      <th style={th}>Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boxes.map((b, i) => (
                      <tr key={b.itemId} style={{ background: i % 2 === 0 ? '#ffffff' : '#f8fafb' }}>
                        <td style={{ ...td, fontWeight: 600 }}>{b.coletaNF || '-'}</td>
                        <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{b.produtoCode}</td>
                        <td style={td}>{b.produtoDescricao}</td>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{b.quantidade}</td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                          {b.alturaCm ?? '?'} × {b.larguraCm ?? '?'} × {b.comprimentoCm ?? '?'}
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                          {b.volumeM3Total != null ? b.volumeM3Total.toFixed(4) : '-'}
                        </td>
                        <td style={td}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {b.fragil && <span style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>Frágil</span>}
                            {!b.empilhavel && <span style={{ background: '#fef9c3', color: '#92400e', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>Não empilhável</span>}
                            {b.posicao === 'FRONTAL' && <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>Frontal</span>}
                            {b.desmontavel && <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>Desmontável</span>}
                            {b.tipoEmbalagem && <span style={{ background: '#f5f3ff', color: '#7c3aed', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{b.tipoEmbalagem}</span>}
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
