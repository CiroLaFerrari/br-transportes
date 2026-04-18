// src/app/api/minutas/[id]/etiquetas/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getMinutaDelegate } from '@/lib/prisma-delegates';
import { buildXls, xlsResponse } from '@/lib/xls';

type RouteContext = {
  params: Promise<{ id: string }>; // Next 15
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function escCsv(v: any) {
  const s = String(v ?? '');
  const safe = s.replace(/"/g, '""').replace(/\r?\n/g, ' ');
  return `"${safe}"`;
}

function toNum(n: any) {
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function fmtDim(a?: any, b?: any, c?: any) {
  const A = a ?? '-';
  const B = b ?? '-';
  const C = c ?? '-';
  return `${A} x ${B} x ${C}`;
}

function buildHtmlEtiquetas(payload: {
  header: { minutaNumero?: string | null; nfNumero?: string; cliente?: string; cidade?: string; uf?: string };
  volumes: Array<{
    etiqueta: string;
    tipo: string;
    codigo: string;
    descricao: string;
    alturaCm?: number | null;
    larguraCm?: number | null;
    comprimentoCm?: number | null;
    pesoKg?: number | null;
    areaM2?: number | null;
    volumeM3?: number | null;
  }>;
}) {
  const { header, volumes } = payload;
  const title = `Etiquetas - ${header.nfNumero ?? ''}`.trim();

  const cards = volumes
    .map((v) => {
      const dim = fmtDim(v.alturaCm, v.larguraCm, v.comprimentoCm);
      const peso = v.pesoKg != null ? `${Number(v.pesoKg).toFixed(2)} kg` : '-';
      const vol = v.volumeM3 != null ? `${Number(v.volumeM3).toFixed(4)} m³` : '-';
      const area = v.areaM2 != null ? `${Number(v.areaM2).toFixed(4)} m²` : '-';

      return `
        <div class="label">
          <div class="top">
            <div class="etq">${v.etiqueta}</div>
            <div class="tipo">${v.tipo}</div>
          </div>

          <div class="row">
            <div class="k">Código</div>
            <div class="v">${v.codigo}</div>
          </div>

          <div class="row desc">
            <div class="k">Descrição</div>
            <div class="v">${v.descricao}</div>
          </div>

          <div class="grid">
            <div class="cell">
              <div class="k">Dimensões (cm)</div>
              <div class="v mono">${dim}</div>
            </div>
            <div class="cell">
              <div class="k">Peso</div>
              <div class="v mono">${peso}</div>
            </div>
            <div class="cell">
              <div class="k">Área</div>
              <div class="v mono">${area}</div>
            </div>
            <div class="cell">
              <div class="k">Volume</div>
              <div class="v mono">${vol}</div>
            </div>
          </div>

          <div class="footer">
            <div class="meta">
              <div><b>NF:</b> ${header.nfNumero ?? '-'}</div>
              <div><b>Cliente:</b> ${header.cliente ?? '-'}</div>
              <div><b>Cidade:</b> ${header.cidade ?? '-'} / ${header.uf ?? '-'}</div>
              ${header.minutaNumero ? `<div><b>Minuta:</b> ${header.minutaNumero}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    })
    .join('\n');

  return `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 8mm; }
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
    .toolbar .t { font-weight: 800; font-size: 14px; }
    .toolbar button {
      background: #111827;
      color: #fff;
      border: 0;
      padding: 8px 12px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 800;
    }
    .sheet { padding: 10px 12px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .label {
      border: 1px solid #111;
      border-radius: 10px;
      padding: 10px;
      min-height: 120px;
      page-break-inside: avoid;
    }
    .top {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: baseline;
      margin-bottom: 8px;
    }
    .etq { font-weight: 900; font-size: 14px; letter-spacing: 0.2px; }
    .tipo {
      font-weight: 800;
      font-size: 12px;
      border: 1px solid #111;
      padding: 2px 8px;
      border-radius: 999px;
    }
    .row { display: grid; grid-template-columns: 80px 1fr; gap: 8px; margin-bottom: 6px; }
    .k { font-size: 11px; opacity: 0.8; font-weight: 800; }
    .v { font-size: 12px; font-weight: 700; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .grid .cell { border-top: 1px dashed #999; padding-top: 6px; }
    .grid { margin-top: 8px; grid-template-columns: 1fr 1fr; gap: 8px; }
    .footer { margin-top: 8px; border-top: 1px solid #e5e7eb; padding-top: 8px; }
    .meta { font-size: 11px; line-height: 1.35; }
    @media print {
      .toolbar { display: none; }
      .sheet { padding: 0; }
      body { margin: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="t">Etiquetas — NF ${header.nfNumero ?? '-'} • ${volumes.length} volume(s)</div>
    <button onclick="window.print()">Imprimir</button>
  </div>

  <div class="sheet">
    <div class="grid">
      ${cards}
    </div>
  </div>
</body>
</html>`;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const minutaId = String(id || '').trim();
    if (!minutaId) return json({ ok: false, error: 'minutaId ausente' }, 400);

    const url = new URL(req.url);
    const format = String(url.searchParams.get('format') || '').toLowerCase();

    const { delegate, key, available } = getMinutaDelegate('findUnique');
    if (!delegate) {
      return json(
        {
          ok: false,
          error:
            'Prisma Client não possui o model de Minuta esperado (ex: MinutaConferencia). Rode "npx prisma generate" e reinicie o dev server.',
          details: { availableDelegates: available },
        },
        500,
      );
    }

    const minuta: any = await (delegate as any).findUnique({
      where: { id: minutaId },
      include: {
        itens: {
          include: { volumes: true },
          orderBy: { createdAt: 'asc' },
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
    };

    const volumesFlat: any[] = [];
    const itens = Array.isArray(minuta.itens) ? minuta.itens : [];
    for (const it of itens) {
      const vols = Array.isArray(it.volumes) ? it.volumes : [];
      for (const v of vols) {
        volumesFlat.push({
          etiqueta: String(v.etiqueta ?? ''),
          tipo: String(v.tipo ?? 'PRODUTO'),
          codigo: String(v.codigo ?? it.produtoCode ?? ''),
          descricao: String(v.descricao ?? it.produtoDescricao ?? ''),
          pesoKg: toNum(v.pesoKg),
          alturaCm: toNum(v.alturaCm),
          larguraCm: toNum(v.larguraCm),
          comprimentoCm: toNum(v.comprimentoCm),
          areaM2: toNum(v.areaM2),
          volumeM3: toNum(v.volumeM3),
        });
      }
    }

    if (format === 'csv' || format === 'xls' || format === 'excel') {
      const headerCols = [
        'Minuta ID', 'Nº Minuta', 'NF', 'Cliente', 'Cidade', 'UF',
        'Etiqueta', 'Tipo', 'Código', 'Descrição',
        'Peso (kg)', 'Altura (cm)', 'Largura (cm)', 'Comprimento (cm)', 'Área (m²)', 'Volume (m³)',
      ];

      const dataRows = volumesFlat.map((v) => [
        minutaId,
        header.minutaNumero ?? '',
        header.nfNumero ?? '',
        header.cliente ?? '',
        header.cidade ?? '',
        header.uf ?? '',
        v.etiqueta,
        v.tipo,
        v.codigo,
        v.descricao,
        v.pesoKg ?? '',
        v.alturaCm ?? '',
        v.larguraCm ?? '',
        v.comprimentoCm ?? '',
        v.areaM2 ?? '',
        v.volumeM3 ?? '',
      ]);

      const xls = buildXls(
        `Etiquetas — NF ${header.nfNumero || minutaId}`,
        headerCols,
        dataRows,
      );
      const res = xlsResponse(xls, `etiquetas-${header.nfNumero || minutaId}.xls`);
      res.headers.set('X-Minuta-Delegate', String(key || ''));
      return res;
    }

    const html = buildHtmlEtiquetas({ header, volumes: volumesFlat });
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Minuta-Delegate': String(key || ''),
      },
    });
  } catch (e: any) {
    console.error('GET /api/minutas/[id]/etiquetas error:', e);
    return json({ ok: false, error: e?.message || 'Falha ao gerar etiquetas' }, 500);
  }
}