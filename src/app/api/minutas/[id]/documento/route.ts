import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = { params: Promise<{ id: string }> };

function safe(v: any) {
  return String(v ?? '').replace(/[<>&"]/g, (ch) =>
    ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '&' ? '&amp;' : '&quot;',
  );
}

function fmtDate(v: any) {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '-';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function dims(v: any) {
  const a = v.alturaCm, b = v.larguraCm, c = v.comprimentoCm;
  if (!a && !b && !c) return '-';
  return `${a ?? '-'} x ${b ?? '-'} x ${c ?? '-'}`;
}

/**
 * GET /api/minutas/[id]/documento
 * Gera HTML imprimível da Minuta de Conferência no formato Excel
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const minutaId = String(id || '').trim();
    if (!minutaId) return NextResponse.json({ error: 'id ausente' }, { status: 400 });

    const minuta: any = await (prisma as any).minutaConferencia.findUnique({
      where: { id: minutaId },
      include: { itens: { orderBy: { createdAt: 'asc' }, include: { volumes: { orderBy: { createdAt: 'asc' } } } } },
    });

    if (!minuta) return NextResponse.json({ error: 'Minuta não encontrada' }, { status: 404 });

    const itensArr: any[] = Array.isArray(minuta.itens) ? minuta.itens : [];

    let totalVolumes = 0;
    let totalPeso = 0;

    const itensHtml: string[] = [];

    for (const it of itensArr) {
      const vols: any[] = Array.isArray(it.volumes) ? it.volumes : [];
      totalVolumes += vols.length;

      const volRows = vols.map((v: any) => {
        const p = Number(v.pesoKg); if (isFinite(p)) totalPeso += p;
        return `<tr>
          <td class="td center">${vols.indexOf(v) + 1}</td>
          <td class="td">${safe(v.descricao)}</td>
          <td class="td center">${safe(dims(v))}</td>
          <td class="td center">${safe(v.endereco ?? '')}</td>
          <td class="td center">${safe(v.embarque ?? '')}</td>
          <td class="td">${safe(v.etiqueta)}</td>
        </tr>`;
      });

      itensHtml.push(`
        <div class="item-block">
          <table style="width:100%;border-collapse:collapse;margin-bottom:4px">
            <tr style="background:#1A4A1A;color:#fff">
              <td class="td" style="font-weight:900;font-size:11px;padding:4px 8px" colspan="2">
                MARCA: <b>${safe(minuta.marca ?? '-')}</b>
              </td>
              <td class="td" style="font-weight:900;font-size:11px;padding:4px 8px" colspan="3">
                DESCRIÇÃO: ${safe(it.produtoDescricao)}
              </td>
              <td class="td right" style="font-weight:900;font-size:11px;padding:4px 8px">
                PESO: ${isFinite(Number(it.pesoKg)) ? Number(it.pesoKg).toFixed(2) + ' kg' : '-'}
              </td>
            </tr>
            <tr style="background:#e8f5e9">
              <td class="td" style="font-size:10px;padding:2px 8px"><b>QUANT.:</b> ${it.quantidade}</td>
              <td class="td" colspan="5" style="font-size:10px;padding:2px 8px"><b>COD.:</b> ${safe(it.produtoCode)}</td>
            </tr>
          </table>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:#d1fae5">
                <th class="th" style="width:40px">QTDE</th>
                <th class="th">ITEM</th>
                <th class="th center" style="width:160px">MEDIDAS (cm)</th>
                <th class="th center" style="width:120px">ENDEREÇO</th>
                <th class="th center" style="width:90px">EMBARQUE</th>
                <th class="th" style="width:150px">ETIQUETA</th>
              </tr>
            </thead>
            <tbody>
              ${volRows.length > 0 ? volRows.join('\n') : '<tr><td class="td" colspan="6">(Sem volumes)</td></tr>'}
            </tbody>
          </table>
        </div>
      `);
    }

    const html = `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <title>Minuta de Conferência — NF ${safe(minuta.nfNumero)}</title>
  <style>
    @page { size: A4; margin: 10mm 12mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #111; margin: 0; padding: 0; font-size: 11px; }
    .toolbar { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; background: #f8fafc; }
    .toolbar .t { font-weight: 900; font-size: 13px; }
    .toolbar button { background: #1A4A1A; color: #fff; border: 0; padding: 7px 14px; border-radius: 8px; cursor: pointer; font-weight: 900; }
    .page { padding: 10px 14px; }

    /* Header */
    .header-brand { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; border-bottom: 3px solid #1A4A1A; padding-bottom: 6px; }
    .brand-name { font-size: 20px; font-weight: 900; color: #1A4A1A; }
    .brand-sub { font-size: 10px; color: #64748b; }
    .doc-meta { text-align: right; font-size: 10px; }
    .doc-title { font-size: 14px; font-weight: 900; color: #1A4A1A; }

    /* Info grid */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-bottom: 10px; border: 1.5px solid #1A4A1A; border-radius: 6px; overflow: hidden; }
    .info-row { display: flex; border-bottom: 1px solid #d1d5db; }
    .info-row:last-child { border-bottom: none; }
    .info-label { background: #f0fdf4; font-weight: 700; font-size: 10px; color: #1A4A1A; padding: 4px 8px; width: 110px; flex-shrink: 0; border-right: 1px solid #d1d5db; display: flex; align-items: center; }
    .info-value { padding: 4px 8px; font-size: 11px; font-weight: 600; flex: 1; }
    .info-col { border-right: 1px solid #bbb; }
    .info-col:last-child { border-right: none; }

    /* Items */
    .item-block { margin-bottom: 12px; border: 1px solid #1A4A1A; border-radius: 4px; overflow: hidden; }
    .th { text-align: left; font-size: 10px; font-weight: 900; padding: 4px 6px; border: 1px solid #bbb; }
    .td { font-size: 10px; padding: 3px 6px; border: 1px solid #ddd; }
    .center { text-align: center; }
    .right { text-align: right; }

    /* Footer */
    .footer-totals { margin-top: 10px; border: 1.5px solid #1A4A1A; border-radius: 6px; padding: 8px 12px; background: #f0fdf4; display: flex; gap: 24px; }
    .footer-totals span { font-size: 13px; font-weight: 900; color: #1A4A1A; }
    .signature-row { margin-top: 20px; display: flex; gap: 40px; }
    .sig-box { flex: 1; border-top: 1.5px solid #1A4A1A; padding-top: 4px; text-align: center; font-size: 10px; color: #555; }

    @media print { .toolbar { display: none; } .page { padding: 0; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="t">Minuta de Conferência — NF ${safe(minuta.nfNumero)}</div>
    <button onclick="window.print()">🖨 Imprimir</button>
  </div>

  <div class="page">
    <!-- Header -->
    <div class="header-brand">
      <div>
        <div class="brand-name">BR Transportes e Logística</div>
        <div class="brand-sub">Documento de Conferência de Embarque</div>
      </div>
      <div class="doc-meta">
        <div class="doc-title">MINUTA DE CONFERÊNCIA</div>
        <div>Emissão: ${safe(fmtDate(new Date()))}</div>
        ${minuta.numero ? `<div>Nº: ${safe(minuta.numero)}</div>` : ''}
      </div>
    </div>

    <!-- Info grid -->
    <div class="info-grid">
      <div class="info-col">
        <div class="info-row">
          <div class="info-label">NOTA FISCAL</div>
          <div class="info-value" style="font-family:monospace;font-weight:900">${safe(minuta.nfNumero)}</div>
        </div>
        <div class="info-row">
          <div class="info-label">CLIENTE</div>
          <div class="info-value">${safe(minuta.cliente)}</div>
        </div>
        <div class="info-row">
          <div class="info-label">DESTINO</div>
          <div class="info-value">${safe(minuta.cidade)} — ${safe(minuta.uf)}</div>
        </div>
        <div class="info-row">
          <div class="info-label">PEDIDO</div>
          <div class="info-value">${safe(minuta.pedido ?? '-')}</div>
        </div>
      </div>
      <div class="info-col">
        <div class="info-row">
          <div class="info-label">CONF. EMBARQUE</div>
          <div class="info-value" style="font-weight:900;font-size:14px;color:#1A4A1A">${totalVolumes}</div>
        </div>
        <div class="info-row">
          <div class="info-label">DATA COLETA</div>
          <div class="info-value">${safe(fmtDate(minuta.dataColeta))}</div>
        </div>
        <div class="info-row">
          <div class="info-label">COLETADOR</div>
          <div class="info-value">${safe(minuta.coletador ?? '-')}</div>
        </div>
        <div class="info-row">
          <div class="info-label">MOTORISTA</div>
          <div class="info-value">${safe(minuta.motorista ?? '-')}</div>
        </div>
      </div>
    </div>

    <!-- Items -->
    ${itensHtml.length > 0 ? itensHtml.join('\n') : '<p>(Sem itens)</p>'}

    <!-- Totals footer -->
    <div class="footer-totals">
      <span>VOLUMES: ${totalVolumes}</span>
      <span>PESO TOTAL: ${totalPeso.toFixed(2)} kg</span>
    </div>

    <!-- Signatures -->
    <div class="signature-row">
      <div class="sig-box">CONFERENTE</div>
      <div class="sig-box">MOTORISTA</div>
      <div class="sig-box">RESPONSÁVEL EXPEDIÇÃO</div>
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Falha ao gerar documento' }, { status: 500 });
  }
}
