import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  params: Promise<{ id: string }>; // Next 15
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Detecta o delegate correto no Prisma Client para o model de Minuta
 * (no seu schema atual: MinutaConferencia)
 */
function getMinutaDelegate() {
  const db: any = prisma as any;

  const candidates = [
    'minuta',
    'Minuta',
    'minutaConferencia',
    'MinutaConferencia',
    'minuta_de_conferencia',
    'minutaDeConferencia',
    'MinutaDeConferencia',
  ];

  for (const key of candidates) {
    const d = db?.[key];
    if (d && typeof d.findUnique === 'function') {
      return { delegate: d, key };
    }
  }

  const keys = Object.keys(db || {}).filter((k) => db?.[k] && typeof db[k].findUnique === 'function');
  return { delegate: null, key: null, available: keys };
}

function toNum(n: any) {
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function fmtDateBR(d: Date) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function fmtMaybeDateBR(v: any) {
  if (!v) return '-';
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return '-';
  return fmtDateBR(dt);
}

function safe(v: any) {
  return String(v ?? '').replace(/[<>&"]/g, (ch) => {
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    if (ch === '&') return '&amp;';
    return '&quot;';
  });
}

function buildHtmlDeclaracao(payload: {
  header: {
    minutaNumero?: string | null;
    nfNumero?: string;
    cliente?: string;
    cidade?: string;
    uf?: string;
    motorista?: string | null;
    dataColeta?: any;
  };
  totals: {
    itens: number;
    volumes: number;
    pesoKg: number | null;
    areaM2: number | null;
    volumeM3: number | null;
  };
  itens: Array<{
    produtoCode: string;
    produtoDescricao: string;
    quantidade: number;
    desmontavel: boolean;
    observacao?: string | null;
  }>;
}) {
  const { header, totals, itens } = payload;

  const title = `Declaração de Recebimento - NF ${header.nfNumero ?? ''}`.trim();
  const hoje = fmtDateBR(new Date());

  const peso = totals.pesoKg != null ? totals.pesoKg.toFixed(2) : '-';
  const area = totals.areaM2 != null ? totals.areaM2.toFixed(4) : '-';
  const vol = totals.volumeM3 != null ? totals.volumeM3.toFixed(4) : '-';

  const rows = itens
    .map((it, idx) => {
      return `
        <tr>
          <td class="td center">${idx + 1}</td>
          <td class="td mono">${safe(it.produtoCode)}</td>
          <td class="td">${safe(it.produtoDescricao)}</td>
          <td class="td center">${safe(it.quantidade)}</td>
          <td class="td center">${it.desmontavel ? 'Sim' : 'Não'}</td>
          <td class="td">${safe(it.observacao ?? '-')}</td>
        </tr>
      `;
    })
    .join('\n');

  return `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${safe(title)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #111; margin: 0; padding: 0; }
    .toolbar {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .toolbar .t { font-weight: 900; font-size: 14px; }
    .toolbar .actions { display: flex; gap: 8px; }
    .toolbar button {
      background: #111827;
      color: #fff;
      border: 0;
      padding: 8px 12px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 900;
    }

    .page { padding: 14px 14px 0; }
    .brand {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }
    .brand .name { font-size: 18px; font-weight: 900; letter-spacing: 0.2px; }
    .brand .meta { font-size: 12px; opacity: 0.9; text-align: right; line-height: 1.3; }

    .box {
      border: 1px solid #111;
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .box h2 {
      margin: 0 0 8px;
      font-size: 14px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .4px;
    }

    .grid {
      display: grid;
      grid-template-columns: 1.3fr 1fr 1fr;
      gap: 8px 12px;
    }
    .kv .k { font-size: 11px; opacity: 0.8; font-weight: 900; margin-bottom: 2px; }
    .kv .v { font-size: 12px; font-weight: 800; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }

    .text {
      font-size: 12px;
      line-height: 1.5;
    }

    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    .th {
      text-align: left;
      font-size: 11px;
      font-weight: 900;
      padding: 8px;
      border: 1px solid #111;
      background: #f3f4f6;
    }
    .td {
      font-size: 11px;
      padding: 8px;
      border: 1px solid #111;
      vertical-align: top;
    }
    .center { text-align: center; }

    .signs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-top: 14px;
    }
    .sig {
      border: 1px solid #111;
      border-radius: 12px;
      padding: 10px;
      min-height: 110px;
    }
    .sig .title { font-weight: 900; font-size: 12px; margin-bottom: 8px; }
    .line { border-top: 1px solid #111; margin-top: 50px; padding-top: 6px; font-size: 11px; }
    .small { font-size: 10px; opacity: 0.85; margin-top: 6px; }

    @media print {
      .toolbar { display: none; }
      .page { padding: 0; }
      body { margin: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="t">Declaração de Recebimento — NF ${safe(header.nfNumero ?? '-')}</div>
    <div class="actions">
      <button onclick="window.print()">Imprimir</button>
    </div>
  </div>

  <div class="page">
    <div class="brand">
      <div class="name">BR Transportes</div>
      <div class="meta">
        <div><b>Documento:</b> Declaração de Recebimento de Mercadoria</div>
        <div><b>Emissão:</b> ${safe(hoje)}</div>
      </div>
    </div>

    <div class="box">
      <h2>Identificação</h2>
      <div class="grid">
        <div class="kv">
          <div class="k">NF</div>
          <div class="v mono">${safe(header.nfNumero ?? '-')}</div>
        </div>
        <div class="kv">
          <div class="k">Minuta (nº interno)</div>
          <div class="v mono">${safe(header.minutaNumero ?? '-')}</div>
        </div>
        <div class="kv">
          <div class="k">Data da Coleta</div>
          <div class="v">${safe(fmtMaybeDateBR(header.dataColeta))}</div>
        </div>

        <div class="kv">
          <div class="k">Cliente</div>
          <div class="v">${safe(header.cliente ?? '-')}</div>
        </div>
        <div class="kv">
          <div class="k">Cidade/UF</div>
          <div class="v">${safe(header.cidade ?? '-')} / ${safe(header.uf ?? '-')}</div>
        </div>
        <div class="kv">
          <div class="k">Motorista</div>
          <div class="v">${safe(header.motorista ?? '-')}</div>
        </div>
      </div>
    </div>

    <div class="box">
      <h2>Resumo da Carga</h2>
      <div class="grid">
        <div class="kv">
          <div class="k">Itens (linhas)</div>
          <div class="v">${safe(totals.itens)}</div>
        </div>
        <div class="kv">
          <div class="k">Volumes (etiquetas)</div>
          <div class="v">${safe(totals.volumes)}</div>
        </div>
        <div class="kv">
          <div class="k">Peso total (kg)</div>
          <div class="v">${safe(peso)}</div>
        </div>

        <div class="kv">
          <div class="k">Área total (m²)</div>
          <div class="v">${safe(area)}</div>
        </div>
        <div class="kv">
          <div class="k">Volume total (m³)</div>
          <div class="v">${safe(vol)}</div>
        </div>
        <div class="kv">
          <div class="k">Observação</div>
          <div class="v">Conferência realizada no ato do recebimento.</div>
        </div>
      </div>

      <div class="text" style="margin-top:10px;">
        Declaro, para os devidos fins, que recebi a mercadoria referente à Nota Fiscal acima identificada,
        conferi a quantidade de itens/volumes informados, e assumo o recebimento na presente data,
        ressalvadas divergências registradas neste documento.
      </div>

      <table>
        <thead>
          <tr>
            <th class="th center" style="width:40px;">#</th>
            <th class="th" style="width:140px;">Código</th>
            <th class="th">Descrição</th>
            <th class="th center" style="width:70px;">Qtd</th>
            <th class="th center" style="width:100px;">Desmontável</th>
            <th class="th" style="width:220px;">Observação</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td class="td" colspan="6">(Sem itens)</td></tr>`}
        </tbody>
      </table>

      <div class="small">
        Este documento é gerado automaticamente pelo sistema (minuta/NF) para impressão e assinatura.
      </div>
    </div>

    <div class="signs">
      <div class="sig">
        <div class="title">Assinatura — Recebedor/Cliente</div>
        <div class="line">Nome / Documento</div>
        <div class="small">Data: ____/____/______</div>
      </div>
      <div class="sig">
        <div class="title">Assinatura — Motorista / Transportadora</div>
        <div class="line">Nome / Documento</div>
        <div class="small">Data: ____/____/______</div>
      </div>
    </div>

    <div style="height: 14px;"></div>
  </div>
</body>
</html>`;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const minutaId = String(id || '').trim();
    if (!minutaId) return json({ ok: false, error: 'minutaId ausente' }, 400);

    const { delegate, key, available } = getMinutaDelegate();
    if (!delegate) {
      return json(
        {
          ok: false,
          error: 'Delegate do Prisma para Minuta não encontrado. Ajuste o nome do model no endpoint.',
          details: { tried: 'minuta/Minuta/minutaConferencia/...', availableDelegates: available || [] },
        },
        500,
      );
    }

    const minuta: any = await delegate.findUnique({
      where: { id: minutaId },
      include: {
        itens: {
          include: {
            volumes: true,
          },
        },
      },
    });

    if (!minuta) return json({ ok: false, error: 'Minuta não encontrada' }, 404);

    const header = {
      minutaNumero: minuta.numero ?? null,
      nfNumero: minuta.nfNumero ?? '',
      cliente: minuta.cliente ?? '',
      cidade: minuta.cidade ?? '',
      uf: minuta.uf ?? '',
      motorista: minuta.motorista ?? null,
      dataColeta: minuta.dataColeta ?? null,
    };

    const itensArr = Array.isArray(minuta.itens) ? minuta.itens : [];

    const itens = itensArr.map((it: any) => ({
      produtoCode: String(it.produtoCode ?? ''),
      produtoDescricao: String(it.produtoDescricao ?? ''),
      quantidade: Number(it.quantidade ?? 0),
      desmontavel: Boolean(it.desmontavel),
      observacao: it.observacao ?? null,
    }));

    let totalVolumes = 0;
    let peso = 0;
    let area = 0;
    let vol = 0;
    let hasPeso = false;
    let hasArea = false;
    let hasVol = false;

    for (const it of itensArr) {
      const vols = Array.isArray(it.volumes) ? it.volumes : [];
      totalVolumes += vols.length;

      // soma preferindo dados dos volumes (se existirem)
      for (const v of vols) {
        const p = toNum(v.pesoKg);
        if (p != null) {
          peso += p;
          hasPeso = true;
        }
        const a = toNum(v.areaM2);
        if (a != null) {
          area += a;
          hasArea = true;
        }
        const m3 = toNum(v.volumeM3);
        if (m3 != null) {
          vol += m3;
          hasVol = true;
        }
      }
    }

    const totals = {
      itens: itens.length,
      volumes: totalVolumes,
      pesoKg: hasPeso ? peso : null,
      areaM2: hasArea ? area : null,
      volumeM3: hasVol ? vol : null,
    };

    const html = buildHtmlDeclaracao({ header, totals, itens });

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Minuta-Delegate': String(key || ''),
      },
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'Falha ao gerar declaração' }, 500);
  }
}