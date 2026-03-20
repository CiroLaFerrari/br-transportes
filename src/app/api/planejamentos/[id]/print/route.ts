import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  params: Promise<{ id: string }>; // Next 15
};

function esc(s: any) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtMoney(v: number) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  } catch {
    return `R$ ${v.toFixed(2)}`;
  }
}

function fmtNum(v: number, max = 3) {
  try {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: max }).format(v);
  } catch {
    return String(v);
  }
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return String(iso);
  }
}

function extractFretePctFromNotes(notesRaw: string) {
  const key = 'FRETE_CLIENTE_PCT=';
  const lines = String(notesRaw || '').split('\n');
  for (const l of lines) {
    const t = l.trim();
    if (t.toUpperCase().startsWith(key)) return t.slice(key.length).trim();
  }
  return '';
}

function toNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Total KG/M3 estimado:
// - usa coleta.pesoTotalKg quando existir
// - senão, tenta somar produto.pesoKg * quantidade
// - M3: tenta produto.volumeM3 * quantidade
function calcTotaisFromColeta(c: any) {
  let kg = toNumber(c?.pesoTotalKg);
  if (!kg && Array.isArray(c?.itens)) {
    kg = c.itens.reduce((acc: number, it: any) => {
      const q = toNumber(it?.quantidade);
      const p = toNumber(it?.Produto?.pesoKg);
      return acc + q * p;
    }, 0);
  }

  let m3 = 0;
  if (Array.isArray(c?.itens)) {
    m3 = c.itens.reduce((acc: number, it: any) => {
      const q = toNumber(it?.quantidade);
      const v = toNumber(it?.Produto?.volumeM3);
      return acc + q * v;
    }, 0);
  }

  const frete = toNumber(c?.valorFrete);

  return { kg, m3, frete };
}

function buildHtml(payload: {
  header: {
    planId: string;
    name: string;
    status: string;
    vehiclePlate?: string;
    driverName?: string;
    createdAt?: string;
    updatedAt?: string;
    notes?: string;
    fretePct: number;
  };
  capacity?: { kg?: number | null; m3?: number | null } | null;
  rows: Array<{
    ordem: number;
    nf: string;
    cliente: string;
    cidadeUf: string;
    kg: number;
    m3: number;
    frete: number;
    freteCliente: number;
  }>;
  resumo: {
    totalNfs: number;
    totalKg: number;
    totalM3: number;
    totalFrete: number;
    totalFreteCliente: number;
    byUf: Array<{ uf: string; n: number }>;
    capOkKg?: boolean | null;
    capOkM3?: boolean | null;
  };
}) {
  const { header, rows, resumo, capacity } = payload;

  const capKgTxt =
    capacity?.kg == null ? '—' : `${fmtNum(capacity.kg, 0)} kg`;
  const capM3Txt =
    capacity?.m3 == null ? '—' : `${fmtNum(capacity.m3, 3)} m³`;

  const capKgStatus =
    capacity?.kg == null
      ? '—'
      : resumo.capOkKg
        ? 'OK'
        : 'ESTOURO';

  const capM3Status =
    capacity?.m3 == null
      ? '—'
      : resumo.capOkM3
        ? 'OK'
        : 'ESTOURO';

  const byUfTxt = resumo.byUf.length
    ? resumo.byUf.map((x) => `${x.uf}: ${x.n}`).join(' • ')
    : '—';

  const title = `Planejamento ${header.name || header.planId}`.trim();

  const trs = rows
    .map((r) => {
      return `
      <tr>
        <td class="td mono">${r.ordem}</td>
        <td class="td"><b>${esc(r.nf)}</b></td>
        <td class="td">${esc(r.cliente)}</td>
        <td class="td">${esc(r.cidadeUf)}</td>
        <td class="td num">${fmtNum(r.kg, 3)}</td>
        <td class="td num">${fmtNum(r.m3, 3)}</td>
        <td class="td num">${fmtMoney(r.frete)}</td>
        <td class="td num">${fmtMoney(r.freteCliente)}</td>
      </tr>
    `;
    })
    .join('\n');

  return `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${esc(title)}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin:0; padding:0; font-family: Arial, sans-serif; color:#0b1220; }
    .toolbar {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
      display:flex;
      justify-content: space-between;
      align-items:center;
      gap: 10px;
    }
    .toolbar .t { font-weight: 900; }
    .toolbar button {
      background:#111827; color:#fff; border:0;
      padding: 8px 12px; border-radius: 10px;
      cursor:pointer; font-weight: 800;
    }
    .wrap { padding: 12px; }
    .grid {
      display:grid;
      grid-template-columns: 1.2fr 1fr 1fr;
      gap: 10px;
      margin-bottom: 10px;
    }
    .card {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 10px;
      background: #fff;
    }
    .k { font-size: 11px; opacity: .7; font-weight: 800; }
    .v { font-size: 13px; font-weight: 800; margin-top: 2px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    table { width: 100%; border-collapse: collapse; }
    .th {
      text-align:left;
      padding: 8px 10px;
      border: 1px solid #e5e7eb;
      background: #f8fafc;
      font-size: 12px;
    }
    .td {
      padding: 8px 10px;
      border: 1px solid #e5e7eb;
      font-size: 12px;
      vertical-align: top;
    }
    .num { text-align:right; }
    .badge {
      display:inline-flex;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 900;
      border: 1px solid #111827;
    }
    .ok { background: #dcfce7; color: #166534; border-color:#166534; }
    .bad { background: #fee2e2; color: #991b1b; border-color:#991b1b; }
    .muted { opacity:.75; }
    .notes { white-space: pre-wrap; font-size: 12px; line-height: 1.3; }
    @media print { .toolbar { display:none; } .wrap { padding: 0; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="t">Planejamento — ${esc(header.name || header.planId)}</div>
    <button onclick="window.print()">Imprimir</button>
  </div>

  <div class="wrap">
    <div class="grid">
      <div class="card">
        <div class="k">ID</div>
        <div class="v mono">${esc(header.planId)}</div>
        <div class="k" style="margin-top:8px;">Status</div>
        <div class="v"><span class="badge">${esc(header.status)}</span></div>
        <div class="k" style="margin-top:8px;">Atualizado em</div>
        <div class="v">${esc(fmtDate(header.updatedAt))}</div>
      </div>

      <div class="card">
        <div class="k">Veículo</div>
        <div class="v mono">${esc(header.vehiclePlate || '—')}</div>
        <div class="k" style="margin-top:8px;">Motorista</div>
        <div class="v">${esc(header.driverName || '—')}</div>

        <div class="k" style="margin-top:8px;">Frete cliente (%)</div>
        <div class="v">${esc(String(header.fretePct.toFixed(2)))}</div>
      </div>

      <div class="card">
        <div class="k">Resumo</div>
        <div class="v">NFs: <span class="mono">${esc(String(resumo.totalNfs))}</span></div>
        <div class="v">Peso: <span class="mono">${esc(fmtNum(resumo.totalKg, 3))}</span> kg</div>
        <div class="v">Volume: <span class="mono">${esc(fmtNum(resumo.totalM3, 3))}</span> m³</div>
        <div class="v">Frete total: <span class="mono">${esc(fmtMoney(resumo.totalFrete))}</span></div>
        <div class="v">Frete cliente (calc): <span class="mono">${esc(fmtMoney(resumo.totalFreteCliente))}</span></div>
        <div class="k" style="margin-top:8px;">UF (contagem)</div>
        <div class="v muted">${esc(byUfTxt)}</div>
      </div>
    </div>

    <div class="grid" style="grid-template-columns: 1fr 1fr 1fr;">
      <div class="card">
        <div class="k">Capacidade (kg)</div>
        <div class="v">${esc(capKgTxt)} — <span class="badge ${capKgStatus === 'OK' ? 'ok' : capKgStatus === 'ESTOURO' ? 'bad' : ''}">${esc(capKgStatus)}</span></div>
      </div>
      <div class="card">
        <div class="k">Capacidade (m³)</div>
        <div class="v">${esc(capM3Txt)} — <span class="badge ${capM3Status === 'OK' ? 'ok' : capM3Status === 'ESTOURO' ? 'bad' : ''}">${esc(capM3Status)}</span></div>
      </div>
      <div class="card">
        <div class="k">Observações</div>
        <div class="notes">${esc(header.notes || '—')}</div>
      </div>
    </div>

    <div class="card" style="margin-top: 10px; overflow-x:auto;">
      <div class="k" style="margin-bottom:6px;">Coletas / Paradas</div>
      <table>
        <thead>
          <tr>
            <th class="th">#</th>
            <th class="th">NF</th>
            <th class="th">Cliente</th>
            <th class="th">Cidade/UF</th>
            <th class="th">Peso (kg)</th>
            <th class="th">Volume (m³)</th>
            <th class="th">Frete (R$)</th>
            <th class="th">Frete cliente (R$)</th>
          </tr>
        </thead>
        <tbody>
          ${trs || `<tr><td class="td" colspan="8">(Sem paradas)</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const planejamentoId = String(id || '').trim();
    if (!planejamentoId) {
      return NextResponse.json({ ok: false, error: 'planejamentoId ausente' }, { status: 400 });
    }

    const plan = await prisma.planejamento.findUnique({
      where: { id: planejamentoId },
      select: {
        id: true,
        name: true,
        status: true,
        vehiclePlate: true,
        driverName: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        paradas: {
          orderBy: { ordem: 'asc' },
          select: {
            ordem: true,
            Coleta: {
              select: {
                id: true,
                nf: true,
                cidade: true,
                uf: true,
                pesoTotalKg: true,
                valorFrete: true,
                Cliente: { select: { razao: true } },
                itens: {
                  select: {
                    quantidade: true,
                    Produto: { select: { pesoKg: true, volumeM3: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!plan) {
      return NextResponse.json({ ok: false, error: 'Planejamento não encontrado' }, { status: 404 });
    }

    const pctRaw = extractFretePctFromNotes(plan.notes || '');
    const pct = Number(String(pctRaw || '0').replace(',', '.'));
    const fretePct = Number.isFinite(pct) ? pct : 0;

    // capacidade do veículo (por placa — simples e suficiente por enquanto)
    let capacity: { kg?: number | null; m3?: number | null } | null = null;
    if (plan.vehiclePlate) {
      const v = await prisma.veiculo.findUnique({
        where: { placa: plan.vehiclePlate },
        select: { capacidadeKg: true, capacidadeM3: true },
      });
      if (v) capacity = { kg: v.capacidadeKg ?? null, m3: v.capacidadeM3 ?? null };
    }

    const rows: Array<any> = [];
    const byUf: Record<string, number> = {};

    let totalKg = 0;
    let totalM3 = 0;
    let totalFrete = 0;
    let totalFreteCliente = 0;

    for (const p of plan.paradas || []) {
      const c = p.Coleta;
      if (!c) continue;

      const { kg, m3, frete } = calcTotaisFromColeta(c);
      const uf = String(c.uf || '').toUpperCase() || '—';
      byUf[uf] = (byUf[uf] || 0) + 1;

      const freteCliente = frete * (fretePct / 100);

      totalKg += kg;
      totalM3 += m3;
      totalFrete += frete;
      totalFreteCliente += freteCliente;

      rows.push({
        ordem: p.ordem,
        nf: c.nf,
        cliente: c.Cliente?.razao ?? '—',
        cidadeUf: `${c.cidade} / ${uf}`,
        kg,
        m3,
        frete,
        freteCliente,
      });
    }

    const byUfArr = Object.entries(byUf)
      .map(([uf, n]) => ({ uf, n }))
      .sort((a, b) => b.n - a.n);

    const capOkKg =
      capacity?.kg == null ? null : totalKg <= Number(capacity.kg);
    const capOkM3 =
      capacity?.m3 == null ? null : totalM3 <= Number(capacity.m3);

    const html = buildHtml({
      header: {
        planId: plan.id,
        name: plan.name || '',
        status: (plan.status as any) || 'DRAFT',
        vehiclePlate: plan.vehiclePlate || '',
        driverName: plan.driverName || '',
        createdAt: (plan.createdAt as any) || null,
        updatedAt: (plan.updatedAt as any) || null,
        notes: plan.notes || '',
        fretePct,
      },
      capacity,
      rows,
      resumo: {
        totalNfs: rows.length,
        totalKg,
        totalM3,
        totalFrete,
        totalFreteCliente,
        byUf: byUfArr,
        capOkKg,
        capOkM3,
      },
    });

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    console.error('GET /api/planejamentos/[id]/print error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erro interno' }, { status: 500 });
  }
}