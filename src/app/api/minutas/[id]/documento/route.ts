import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = { params: Promise<{ id: string }> };

function getMinutaDelegate() {
  const db: any = prisma as any;
  const candidates = ['minuta', 'Minuta', 'minutaConferencia', 'MinutaConferencia', 'minutaDeConferencia'];
  for (const key of candidates) {
    const d = db?.[key];
    if (d && typeof d.findUnique === 'function') return d;
  }
  return null;
}

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

/**
 * GET /api/minutas/[id]/documento
 * Gera HTML imprimível da Minuta de Conferência
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const minutaId = String(id || '').trim();
    if (!minutaId) return NextResponse.json({ error: 'id ausente' }, { status: 400 });

    const delegate = getMinutaDelegate();
    if (!delegate) return NextResponse.json({ error: 'Delegate Minuta não encontrado' }, { status: 500 });

    const minuta: any = await delegate.findUnique({
      where: { id: minutaId },
      include: { itens: { include: { volumes: true } } },
    });

    if (!minuta) return NextResponse.json({ error: 'Minuta não encontrada' }, { status: 404 });

    const itensArr: any[] = Array.isArray(minuta.itens) ? minuta.itens : [];

    let totalVolumes = 0;
    let totalPeso = 0;
    let totalArea = 0;
    let totalVol = 0;

    const itensRows: string[] = [];

    for (const it of itensArr) {
      const vols: any[] = Array.isArray(it.volumes) ? it.volumes : [];
      totalVolumes += vols.length;

      // Volumes rows
      const volRows = vols.map((v: any) => {
        const p = Number(v.pesoKg); if (isFinite(p)) totalPeso += p;
        const a = Number(v.areaM2); if (isFinite(a)) totalArea += a;
        const m3 = Number(v.volumeM3); if (isFinite(m3)) totalVol += m3;
        return `<tr>
          <td class="td mono" style="font-size:10px">${safe(v.etiqueta)}</td>
          <td class="td">${safe(v.descricao)}</td>
          <td class="td center">${safe(v.alturaCm ?? '-')} x ${safe(v.larguraCm ?? '-')} x ${safe(v.comprimentoCm ?? '-')}</td>
          <td class="td right">${isFinite(Number(v.volumeM3)) ? Number(v.volumeM3).toFixed(4) : '-'}</td>
          <td class="td right">${isFinite(Number(v.areaM2)) ? Number(v.areaM2).toFixed(4) : '-'}</td>
          <td class="td right">${isFinite(Number(v.pesoKg)) ? Number(v.pesoKg).toFixed(2) : '-'}</td>
        </tr>`;
      });

      itensRows.push(`
        <tr style="background:#f3f4f6">
          <td class="td" colspan="6" style="font-weight:900;font-size:12px;">
            Item: <span class="mono">${safe(it.produtoCode)}</span> — ${safe(it.produtoDescricao)}
            &nbsp;&nbsp;|&nbsp;&nbsp;Qtd: ${it.quantidade}
            &nbsp;&nbsp;|&nbsp;&nbsp;Desmontável: ${it.desmontavel ? 'Sim' : 'Não'}
            ${it.observacao ? `&nbsp;&nbsp;|&nbsp;&nbsp;Obs: ${safe(it.observacao)}` : ''}
          </td>
        </tr>
        ${volRows.join('\n')}
      `);
    }

    const hoje = fmtDate(new Date());

    const html = `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <title>Minuta de Conferência - NF ${safe(minuta.nfNumero)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #111; margin: 0; padding: 0; font-size: 12px; }
    .toolbar { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; }
    .toolbar .t { font-weight: 900; font-size: 14px; }
    .toolbar button { background: #111827; color: #fff; border: 0; padding: 8px 12px; border-radius: 10px; cursor: pointer; font-weight: 900; }
    .page { padding: 14px; }
    .brand { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
    .brand .name { font-size: 18px; font-weight: 900; }
    .brand .meta { font-size: 11px; text-align: right; line-height: 1.4; }
    .box { border: 1px solid #111; border-radius: 10px; padding: 12px; margin-bottom: 10px; }
    .box h2 { margin: 0 0 8px; font-size: 13px; font-weight: 900; text-transform: uppercase; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 12px; }
    .kv .k { font-size: 10px; opacity: 0.7; font-weight: 700; }
    .kv .v { font-size: 12px; font-weight: 800; }
    .mono { font-family: ui-monospace, monospace; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    .th { text-align: left; font-size: 10px; font-weight: 900; padding: 6px; border: 1px solid #111; background: #e5e7eb; }
    .td { font-size: 11px; padding: 5px 6px; border: 1px solid #ccc; }
    .center { text-align: center; }
    .right { text-align: right; }
    .totals { margin-top: 8px; font-size: 13px; font-weight: 900; display: flex; gap: 20px; }
    @media print { .toolbar { display: none; } .page { padding: 0; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="t">Minuta de Conferência — NF ${safe(minuta.nfNumero)}</div>
    <div><button onclick="window.print()">Imprimir</button></div>
  </div>

  <div class="page">
    <div class="brand">
      <div class="name">BR Transportes</div>
      <div class="meta">
        <div><b>Documento:</b> Minuta de Conferência</div>
        <div><b>Emissão:</b> ${safe(hoje)}</div>
      </div>
    </div>

    <div class="box">
      <h2>Dados da Coleta</h2>
      <div class="grid">
        <div class="kv"><div class="k">Nota Fiscal</div><div class="v mono">${safe(minuta.nfNumero)}</div></div>
        <div class="kv"><div class="k">Nº Minuta</div><div class="v">${safe(minuta.numero ?? '-')}</div></div>
        <div class="kv"><div class="k">Data da Coleta</div><div class="v">${safe(fmtDate(minuta.dataColeta))}</div></div>
        <div class="kv"><div class="k">Data Entrada</div><div class="v">${safe(fmtDate(minuta.createdAt))}</div></div>
        <div class="kv"><div class="k">Cliente</div><div class="v">${safe(minuta.cliente)}</div></div>
        <div class="kv"><div class="k">Destino</div><div class="v">${safe(minuta.cidade)} / ${safe(minuta.uf)}</div></div>
        <div class="kv"><div class="k">Pedido</div><div class="v">${safe(minuta.pedido ?? '-')}</div></div>
        <div class="kv"><div class="k">Coletador</div><div class="v">${safe(minuta.coletador ?? '-')}</div></div>
        <div class="kv"><div class="k">Motorista</div><div class="v">${safe(minuta.motorista ?? '-')}</div></div>
      </div>
    </div>

    <div class="box">
      <h2>Itens e Volumes</h2>
      <table>
        <thead>
          <tr>
            <th class="th" style="width:160px">Etiqueta</th>
            <th class="th">Descrição</th>
            <th class="th center" style="width:130px">Medidas (cm)</th>
            <th class="th right" style="width:80px">M³</th>
            <th class="th right" style="width:80px">M²</th>
            <th class="th right" style="width:80px">Peso (kg)</th>
          </tr>
        </thead>
        <tbody>
          ${itensRows.length > 0 ? itensRows.join('\n') : '<tr><td class="td" colspan="6">(Sem itens)</td></tr>'}
        </tbody>
      </table>

      <div class="totals">
        <span>Total Volumes: ${totalVolumes}</span>
        <span>Total Peso: ${totalPeso.toFixed(2)} kg</span>
        <span>Total Área: ${totalArea.toFixed(4)} m²</span>
        <span>Total Volume: ${totalVol.toFixed(4)} m³</span>
      </div>
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
