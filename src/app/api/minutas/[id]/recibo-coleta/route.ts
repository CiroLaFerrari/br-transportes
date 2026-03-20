import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = { params: Promise<{ id: string }> };

function getMinutaDelegate() {
  const db: any = prisma as any;
  for (const key of ['minuta', 'Minuta', 'minutaConferencia', 'MinutaConferencia', 'minutaDeConferencia']) {
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
 * GET /api/minutas/[id]/recibo-coleta
 * Gera HTML imprimível do Recibo de Coleta (para o coletador)
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
    let totalPeso = 0;
    const totalValor = 0;
    let totalVolumes = 0;

    const nfRows: string[] = [];

    for (const it of itensArr) {
      const vols: any[] = Array.isArray(it.volumes) ? it.volumes : [];
      totalVolumes += vols.length;
      for (const v of vols) {
        const p = Number(v.pesoKg);
        if (isFinite(p)) totalPeso += p;
      }
    }

    // Build one row per item
    for (let i = 0; i < itensArr.length; i++) {
      const it = itensArr[i];
      const vols = Array.isArray(it.volumes) ? it.volumes : [];
      const pesoItem = vols.reduce((acc: number, v: any) => acc + (Number(v.pesoKg) || 0), 0);
      nfRows.push(`<tr>
        <td class="td center">${i + 1}</td>
        <td class="td mono">${safe(it.produtoCode)}</td>
        <td class="td">${safe(it.produtoDescricao)}</td>
        <td class="td center">${it.quantidade}</td>
        <td class="td right">${pesoItem > 0 ? pesoItem.toFixed(2) : '-'}</td>
        <td class="td center">${vols.length}</td>
      </tr>`);
    }

    const hoje = fmtDate(new Date());
    const coletador = safe(minuta.coletador || minuta.motorista || '-');

    const html = `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <title>Recibo de Coleta - NF ${safe(minuta.nfNumero)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #111; margin: 0; padding: 0; font-size: 12px; }
    .toolbar { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; }
    .toolbar .t { font-weight: 900; font-size: 14px; }
    .toolbar button { background: #1A4A1A; color: #fff; border: 0; padding: 8px 12px; border-radius: 10px; cursor: pointer; font-weight: 900; }
    .page { padding: 14px; }
    .brand { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
    .brand .name { font-size: 20px; font-weight: 900; color: #1A4A1A; }
    .brand .meta { font-size: 11px; text-align: right; line-height: 1.4; }
    .box { border: 1px solid #333; border-radius: 10px; padding: 12px; margin-bottom: 12px; }
    .box h2 { margin: 0 0 8px; font-size: 13px; font-weight: 900; text-transform: uppercase; color: #1A4A1A; }
    .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px 12px; }
    .kv .k { font-size: 10px; opacity: 0.7; font-weight: 700; }
    .kv .v { font-size: 12px; font-weight: 800; }
    .mono { font-family: ui-monospace, monospace; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    .th { text-align: left; font-size: 10px; font-weight: 900; padding: 6px; border: 1px solid #333; background: #e8f5e9; }
    .td { font-size: 11px; padding: 5px 6px; border: 1px solid #ccc; }
    .center { text-align: center; }
    .right { text-align: right; }
    .text { font-size: 12px; line-height: 1.5; margin-top: 10px; }
    .sig { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
    .sig-box { text-align: center; }
    .sig-line { border-top: 1px solid #333; margin-top: 50px; padding-top: 6px; font-size: 11px; }
    .totals { margin-top: 8px; font-size: 13px; font-weight: 900; display: flex; gap: 20px; }
    @media print { .toolbar { display: none; } .page { padding: 0; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="t">Recibo de Coleta — NF ${safe(minuta.nfNumero)}</div>
    <div><button onclick="window.print()">Imprimir</button></div>
  </div>

  <div class="page">
    <div class="brand">
      <div class="name">BR Transportes e Logística</div>
      <div class="meta">
        <div><b>Documento:</b> Recibo de Coleta</div>
        <div><b>Emissão:</b> ${safe(hoje)}</div>
      </div>
    </div>

    <div class="box">
      <h2>Dados da Coleta</h2>
      <div class="grid">
        <div class="kv"><div class="k">Nota Fiscal</div><div class="v mono">${safe(minuta.nfNumero)}</div></div>
        <div class="kv"><div class="k">Cliente</div><div class="v">${safe(minuta.cliente)}</div></div>
        <div class="kv"><div class="k">Destino</div><div class="v">${safe(minuta.cidade)} / ${safe(minuta.uf)}</div></div>
        <div class="kv"><div class="k">Data da Coleta</div><div class="v">${safe(fmtDate(minuta.dataColeta))}</div></div>
        <div class="kv"><div class="k">Coletador</div><div class="v">${coletador}</div></div>
        <div class="kv"><div class="k">Pedido</div><div class="v">${safe(minuta.pedido ?? '-')}</div></div>
      </div>
    </div>

    <div class="box">
      <h2>Itens Coletados</h2>
      <table>
        <thead>
          <tr>
            <th class="th center" style="width:35px">#</th>
            <th class="th" style="width:130px">Código</th>
            <th class="th">Descrição</th>
            <th class="th center" style="width:50px">Qtd</th>
            <th class="th right" style="width:80px">Peso (kg)</th>
            <th class="th center" style="width:60px">Volumes</th>
          </tr>
        </thead>
        <tbody>
          ${nfRows.length > 0 ? nfRows.join('\n') : '<tr><td class="td" colspan="6">(Sem itens)</td></tr>'}
        </tbody>
      </table>

      <div class="totals">
        <span>Total Itens: ${itensArr.length}</span>
        <span>Total Volumes: ${totalVolumes}</span>
        <span>Total Peso: ${totalPeso.toFixed(2)} kg</span>
      </div>
    </div>

    <div class="text">
      Eu, <b>${coletador}</b>, declaro para os devidos fins que recebi da empresa
      <b>BR Transportes e Logística</b>, inscrita no CNPJ nº 07.727.329/0001-06,
      os materiais acima relacionados referentes à prestação de serviço de transporte/coleta.
    </div>

    <div class="sig">
      <div class="sig-box">
        <div class="sig-line">Assinatura do Coletador</div>
      </div>
      <div class="sig-box">
        <div class="sig-line">Assinatura BR Transportes</div>
      </div>
    </div>

    <div style="margin-top: 20px; font-size: 10px; opacity: 0.7; text-align: center;">
      Data: ____/____/______
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Falha ao gerar recibo' }, { status: 500 });
  }
}
