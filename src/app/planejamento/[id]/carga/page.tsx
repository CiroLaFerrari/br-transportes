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
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#a855f7',
  '#64748b', '#e11d48', '#0ea5e9', '#84cc16', '#d946ef',
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

  // Layout computation: simple greedy strip packing (top-down view)
  const truckW = veiculo?.largCm || 250; // default 250cm wide
  const truckL = veiculo?.compCm || 1400; // default 14m long

  type PlacedBox = Box & { x: number; y: number; w: number; h: number; color: string; idx: number };

  function computeLayout(): PlacedBox[] {
    const sorted = [...boxes].sort((a, b) => {
      // FRONTAL first, then by size descending
      const pa = a.posicao === 'FRONTAL' ? 0 : 1;
      const pb = b.posicao === 'FRONTAL' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const areaA = (a.comprimentoCm || 100) * (a.larguraCm || 100);
      const areaB = (b.comprimentoCm || 100) * (b.larguraCm || 100);
      return areaB - areaA;
    });

    const placed: PlacedBox[] = [];
    // Simple shelf/strip algorithm
    let shelfY = 0;
    let shelfX = 0;
    let shelfH = 0;

    let colorIdx = 0;
    const coletaColorMap = new Map<string, string>();

    for (const box of sorted) {
      const qty = box.quantidade || 1;
      if (!coletaColorMap.has(box.coletaId)) {
        coletaColorMap.set(box.coletaId, getColor(colorIdx++));
      }
      const color = coletaColorMap.get(box.coletaId) || '#666';

      for (let q = 0; q < qty; q++) {
        const w = box.larguraCm || Math.min(truckW, 80);
        const h = box.comprimentoCm || Math.min(truckL / 4, 120);

        if (shelfX + w > truckW) {
          // New shelf
          shelfY += shelfH;
          shelfX = 0;
          shelfH = 0;
        }

        if (shelfY + h > truckL) {
          // Overflow — still place but will be cut off visually
        }

        placed.push({
          ...box,
          x: shelfX,
          y: shelfY,
          w,
          h,
          color,
          idx: placed.length,
        });

        shelfX += w;
        if (h > shelfH) shelfH = h;
      }
    }

    return placed;
  }

  const placedBoxes = computeLayout();

  // SVG scale - ensure minimum visible size
  const svgPadding = 30;
  const targetW = 600; // target width in pixels
  const scale = Math.max(targetW / truckW, 0.3); // ensure minimum scale
  const svgW = truckW * scale + svgPadding * 2;
  const svgH = truckL * scale + svgPadding * 2;

  const totalVol = boxes.reduce((acc, b) => acc + (b.volumeM3Total || 0), 0);
  const totalItems = boxes.reduce((acc, b) => acc + (b.quantidade || 1), 0);

  const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 700, color: '#1e293b' };
  const td: React.CSSProperties = { padding: '6px 8px', border: '1px solid #e2e8f0', color: '#1e293b' };

  return (
    <div style={{ padding: 16, color: '#1e293b', minHeight: '100vh' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <Link href={`/planejamento`} style={{ color: '#1A4A1A', textDecoration: 'none', fontWeight: 600 }}>
          Planejamento
        </Link>
        <span style={{ opacity: 0.5 }}>/</span>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, color: '#1A4A1A' }}>
          Layout de Carga {planName ? `— ${planName}` : ''}
        </h1>
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}
      {loading && <div>Carregando...</div>}

      {!loading && (
        <>
          {/* Info */}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16, fontSize: 14 }}>
            {veiculo && (
              <div style={{ padding: 10, border: '1px solid #e2e8f0', background: '#ffffff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <b>Veículo:</b> {veiculo.placa} — {veiculo.compCm}×{veiculo.largCm}×{veiculo.altCm} cm
              </div>
            )}
            <div style={{ padding: 10, border: '1px solid #e2e8f0', background: '#ffffff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <b>Itens:</b> {totalItems} | <b>Volume:</b> {totalVol.toFixed(3)} m³
            </div>
            {!veiculo && (
              <div style={{ padding: 10, border: '1px solid #F5BE16', background: '#fef9e7', borderRadius: 12, color: '#92400e' }}>
                Nenhum veículo vinculado — usando dimensões padrão ({truckW}×{truckL} cm)
              </div>
            )}
          </div>

          {/* SVG Layout */}
          {boxes.length > 0 ? (
            <div style={{ marginBottom: 24, overflow: 'auto' }}>
              <div style={{ fontSize: 13, marginBottom: 6, opacity: 0.7 }}>
                Vista superior (frente do veículo = topo)
              </div>
              <svg width={svgW} height={svgH} style={{ background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                {/* Truck outline */}
                <rect
                  x={svgPadding}
                  y={svgPadding}
                  width={truckW * scale}
                  height={truckL * scale}
                  fill="none"
                  stroke="#475569"
                  strokeWidth={2}
                  strokeDasharray="8,4"
                />
                {/* Cab indicator */}
                <rect
                  x={svgPadding + truckW * scale * 0.2}
                  y={svgPadding - 14}
                  width={truckW * scale * 0.6}
                  height={12}
                  fill="#334155"
                  rx={3}
                />
                <text
                  x={svgPadding + truckW * scale * 0.5}
                  y={svgPadding - 5}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize={9}
                >
                  CABINE
                </text>

                {/* Placed boxes */}
                {placedBoxes.map((b, i) => (
                  <g key={i}>
                    <rect
                      x={svgPadding + b.x * scale}
                      y={svgPadding + b.y * scale}
                      width={b.w * scale}
                      height={b.h * scale}
                      fill={b.color + '44'}
                      stroke={b.color}
                      strokeWidth={1.5}
                      rx={2}
                    />
                    {b.fragil && (
                      <text
                        x={svgPadding + b.x * scale + 3}
                        y={svgPadding + b.y * scale + 12}
                        fill="#fbbf24"
                        fontSize={10}
                        fontWeight={700}
                      >
                        !
                      </text>
                    )}
                    {b.w * scale > 30 && b.h * scale > 20 && (
                      <text
                        x={svgPadding + (b.x + b.w / 2) * scale}
                        y={svgPadding + (b.y + b.h / 2) * scale}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#fff"
                        fontSize={Math.min(10, b.w * scale * 0.15)}
                        fontWeight={600}
                      >
                        {b.produtoCode.length > 12 ? b.produtoCode.slice(0, 10) + '..' : b.produtoCode}
                      </text>
                    )}
                  </g>
                ))}
              </svg>
            </div>
          ) : (
            <div style={{ padding: 20, opacity: 0.6 }}>Nenhum item de carga encontrado para este planejamento.</div>
          )}

          {/* Legend by coleta */}
          {boxes.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 900, color: '#1A4A1A', marginBottom: 8 }}>Legenda (por NF/Coleta)</h3>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {(() => {
                  const seen = new Map<string, { nf: string; color: string }>();
                  for (const b of placedBoxes) {
                    if (!seen.has(b.coletaId)) {
                      seen.set(b.coletaId, { nf: b.coletaNF || b.coletaId.slice(0, 8), color: b.color });
                    }
                  }
                  return Array.from(seen.entries()).map(([cId, { nf, color }]) => (
                    <div key={cId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <div style={{ width: 16, height: 16, background: color + '66', border: `2px solid ${color}`, borderRadius: 3 }} />
                      <span>NF {nf}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

          {/* Items table */}
          {boxes.length > 0 && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 900, color: '#1A4A1A', marginBottom: 8 }}>Detalhamento de itens</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={th}>NF</th>
                    <th style={th}>Código</th>
                    <th style={th}>Descrição</th>
                    <th style={th}>Qtd</th>
                    <th style={th}>Dimensões (cm)</th>
                    <th style={th}>Vol. (m³)</th>
                    <th style={th}>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {boxes.map((b) => (
                    <tr key={b.itemId}>
                      <td style={td}>{b.coletaNF || '-'}</td>
                      <td style={td}>{b.produtoCode}</td>
                      <td style={td}>{b.produtoDescricao}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{b.quantidade}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {b.alturaCm ?? '?'}×{b.larguraCm ?? '?'}×{b.comprimentoCm ?? '?'}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {b.volumeM3Total != null ? b.volumeM3Total.toFixed(4) : '-'}
                      </td>
                      <td style={td}>
                        {[
                          b.fragil && 'Frágil',
                          !b.empilhavel && 'Não empilhável',
                          b.posicao === 'FRONTAL' && 'Frontal',
                          b.desmontavel && 'Desmontável',
                          b.tipoEmbalagem && b.tipoEmbalagem,
                        ]
                          .filter(Boolean)
                          .join(', ') || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
