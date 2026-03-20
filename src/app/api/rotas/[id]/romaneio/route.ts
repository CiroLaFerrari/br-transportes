import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR');
  } catch {
    return String(iso);
  }
}

function escHtml(v: any) {
  const s = String(v ?? '');
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escCsv(v: any) {
  const s = String(v ?? '');
  const safe = s.replace(/"/g, '""').replace(/\r?\n/g, ' ');
  return `"${safe}"`;
}

function buildHtmlRomaneio(payload: {
  header: {
    rotaId: string;
    dataRota?: string | null;
    status?: string | null;
    totalParadas: number;
    entregues: number;
  };
  rows: Array<{
    ordem: number;
    nf: string;
    cliente: string;
    cidade: string;
    uf: string;
    statusExec: string;
    checkinAt?: string | null;
    checkoutAt?: string | null;
  }>;
}) {
  const { header, rows } = payload;

  const title = `Romaneio de Entregas - Rota ${header.rotaId}`;

  const trs = rows
    .map((r) => {
      return `
        <tr>
          <td class="c">${r.ordem}</td>
          <td class="b">${escHtml(r.nf)}</td>
          <td>${escHtml(r.cliente)}</td>
          <td>${escHtml(r.cidade)} / ${escHtml(r.uf)}</td>
          <td class="c">${escHtml(r.statusExec)}</td>
          <td class="c">${escHtml(fmtDate(r.checkinAt || null))}</td>
          <td class="c">${escHtml(fmtDate(r.checkoutAt || null))}</td>
        </tr>
      `;
    })
    .join('\n');

  return `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escHtml(title)}</title>
  <style>
    @page { size: A4; margin: 10mm; }
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
    .toolbar button {
      background: #111827;
      color: #fff;
      border: 0;
      padding: 8px 12px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 800;
    }
    .sheet { padding: 12px; }
    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 12px;
      margin-bottom: 12px;
      font-size: 12px;
    }
    .meta .k { opacity: 0.75; font-weight: 800; }
    .meta .v { font-weight: 900; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; vertical-align: top; }
    th { background: #f8fafc; text-align: left; font-weight: 900; }
    .c { text-align: center; white-space: nowrap; }
    .b { font-weight: 900; }
    @media print {
      .toolbar { display: none; }
      .sheet { padding: 0; }
      body { margin: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="t">Romaneio — Rota ${escHtml(header.rotaId)} • ${header.totalParadas} parada(s) • ${header.entregues} entregue(s)</div>
    <div style="display:flex; gap:8px;">
      <button onclick="window.print()">Imprimir</button>
    </div>
  </div>

  <div class="sheet">
    <div class="meta">
      <div><div class="k">Rota</div><div class="v">${escHtml(header.rotaId)}</div></div>
      <div><div class="k">Status</div><div class="v">${escHtml(header.status || '-')}</div></div>
      <div><div class="k">Data</div><div class="v">${escHtml(fmtDate(header.dataRota || null))}</div></div>
      <div><div class="k">Progresso</div><div class="v">${header.entregues} / ${header.totalParadas}</div></div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:60px;">Ordem</th>
          <th style="width:110px;">NF</th>
          <th>Cliente</th>
          <th style="width:140px;">Cidade/UF</th>
          <th style="width:120px;">Status</th>
          <th style="width:130px;">Check-in</th>
          <th style="width:130px;">Check-out</th>
        </tr>
      </thead>
      <tbody>
        ${trs || `<tr><td colspan="7" style="padding:12px; opacity:.75;">(Sem paradas)</td></tr>`}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

// GET /api/rotas/:id/romaneio?format=html|csv
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const rotaId = String(id || '').trim();
    if (!rotaId) return json({ ok: false, error: 'rotaId ausente' }, 400);

    const url = new URL(req.url);
    const format = String(url.searchParams.get('format') || 'html').toLowerCase();

    const rota = await prisma.rota.findUnique({
      where: { id: rotaId },
      include: {
        paradas: {
          orderBy: { ordem: 'asc' },
          include: {
            Coleta: {
              select: {
                id: true,
                nf: true,
                cidade: true,
                uf: true,
                Cliente: { select: { razao: true } },
              },
            },
          },
        },
      },
    });

    if (!rota) return json({ ok: false, error: 'Rota não encontrada' }, 404);

    const rows = (rota.paradas || []).map((p) => ({
      ordem: p.ordem,
      nf: p.Coleta?.nf ?? '-',
      cliente: p.Coleta?.Cliente?.razao ?? '-',
      cidade: p.Coleta?.cidade ?? '-',
      uf: p.Coleta?.uf ?? '-',
      statusExec: String(p.statusExec || 'PENDENTE'),
      checkinAt: (p as any).checkinAt ?? null,
      checkoutAt: (p as any).checkoutAt ?? null,
    }));

    const entregues = (rota.paradas || []).filter((p) => p.statusExec === 'ENTREGUE').length;

    // CSV
    if (format === 'csv') {
      const headerCols = ['rotaId', 'dataRota', 'statusRota', 'ordem', 'nf', 'cliente', 'cidade', 'uf', 'statusExec', 'checkinAt', 'checkoutAt'];
      const lines = [headerCols.map(escCsv).join(',')];

      for (const r of rows) {
        lines.push(
          [
            rotaId,
            (rota as any).dataRota ? String((rota as any).dataRota) : '',
            String((rota as any).status ?? ''),
            r.ordem,
            r.nf,
            r.cliente,
            r.cidade,
            r.uf,
            r.statusExec,
            r.checkinAt ?? '',
            r.checkoutAt ?? '',
          ].map(escCsv).join(','),
        );
      }

      const csv = lines.join('\n');
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="romaneio-${rotaId}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // HTML
    const html = buildHtmlRomaneio({
      header: {
        rotaId,
        dataRota: (rota as any).dataRota ? String((rota as any).dataRota) : null,
        status: String((rota as any).status ?? ''),
        totalParadas: rows.length,
        entregues,
      },
      rows,
    });

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    console.error('GET /api/rotas/[id]/romaneio error:', e);
    return json({ ok: false, error: e?.message || 'Falha ao gerar romaneio' }, 500);
  }
}