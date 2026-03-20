import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import ExcelJS from 'exceljs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseDateOnly(s?: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 0, 0, 0));
  return isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const dateFromStr = url.searchParams.get('dateFrom');
    const dateToStr   = url.searchParams.get('dateTo');
    const costPerKm   = Number(url.searchParams.get('costPerKm') || '0'); // opcional

    // período padrão = hoje
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dFrom = parseDateOnly(dateFromStr) ?? parseDateOnly(`${yyyy}-${mm}-${dd}`)!;
    const dToInc = parseDateOnly(dateToStr) ?? dFrom;
    const dToExclusive = new Date(dToInc.getTime() + 24 * 60 * 60 * 1000);

    const rotas = await prisma.routePlan.findMany({
      where: { createdAt: { gte: dFrom, lt: dToExclusive } },
      orderBy: { createdAt: 'desc' },
      include: { stops: { orderBy: { order: 'asc' } } },
    });

    // ====== monta o workbook ======
    const wb = new ExcelJS.Workbook();
    wb.creator = 'BR Transportes';
    wb.created = new Date();

    // --- Sheet 1: Resumo ---
    const ws1 = wb.addWorksheet('Resumo', { views: [{ state: 'frozen', ySplit: 2 }] });

    // título + período
    ws1.mergeCells('A1', 'G1');
    ws1.getCell('A1').value = `Relatório de Rotas — ${dFrom.toISOString().slice(0,10)} a ${dToInc.toISOString().slice(0,10)}`;
    ws1.getCell('A1').font = { size: 14, bold: true };

    ws1.addRow([]); // linha 2 vazia

    ws1.columns = [
      { header: 'ID',           key: 'id',        width: 36 },
      { header: 'Data/Hora',    key: 'createdAt', width: 20 },
      { header: 'Origem',       key: 'origin',    width: 32 },
      { header: 'Total km',     key: 'totalKm',   width: 12, style: { numFmt: '0.00' } },
      { header: 'Paradas',      key: 'stopsCnt',  width: 10 },
      { header: 'Paradas (lista)', key: 'stopsList', width: 60 },
      { header: 'Custo (R$)',   key: 'cost',      width: 14, style: { numFmt: 'R$ #,##0.00' } },
    ];

    let somaKm = 0;
    for (const r of rotas) {
      const km = Number(r.totalKm || 0);
      somaKm += km;
      ws1.addRow({
        id: r.id,
        createdAt: new Date(r.createdAt),
        origin: r.origin,
        totalKm: km,
        stopsCnt: r.stops.length,
        stopsList: r.stops.map(s => s.destination).join(' | '),
        cost: costPerKm > 0 ? km * costPerKm : null,
      });
    }

    // formata Data/Hora
    ws1.getColumn('createdAt').numFmt = 'dd/mm/yyyy hh:mm';

    // cabeçalho em negrito
    const headerRow = ws1.getRow(3);
    headerRow.font = { bold: true };

    // totalizadores
    const totalRow = ws1.addRow([]);
    totalRow.getCell('C').value = 'Totais';
    totalRow.getCell('C').font = { bold: true };
    totalRow.getCell('D').value = Number(somaKm.toFixed(2));
    totalRow.getCell('D').numFmt = '0.00';
    if (costPerKm > 0) {
      totalRow.getCell('G').value = Number((somaKm * costPerKm).toFixed(2));
      totalRow.getCell('G').numFmt = 'R$ #,##0.00';
    }

    // bordas leves
    ws1.eachRow((row, idx) => {
      if (idx >= 3) {
        row.eachCell((cell) => {
          cell.border = { top: {style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
        });
      }
    });

    // --- Sheet 2: Paradas ---
    const ws2 = wb.addWorksheet('Paradas', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws2.columns = [
      { header: 'Rota ID',     key: 'routeId',    width: 36 },
      { header: 'Data/Hora',   key: 'createdAt',  width: 20 },
      { header: 'Ordem',       key: 'order',      width: 8 },
      { header: 'Destino',     key: 'destination',width: 40 },
      { header: 'km',          key: 'km',         width: 10, style: { numFmt: '0.00' } },
      { header: 'min',         key: 'min',        width: 10 },
    ];
    ws2.getRow(1).font = { bold: true };
    ws2.getColumn('createdAt').numFmt = 'dd/mm/yyyy hh:mm';

    for (const r of rotas) {
      for (const s of r.stops) {
        ws2.addRow({
          routeId: r.id,
          createdAt: new Date(r.createdAt),
          order: s.order,
          destination: s.destination,
          km: Number(s.km || 0),
          min: Number(s.durMin || 0),
        });
      }
    }

    // ====== gera o buffer e responde ======
    const buffer = await wb.xlsx.writeBuffer();
    const fname = `rotas_${dFrom.toISOString().slice(0,10)}_${dToInc.toISOString().slice(0,10)}.xlsx`;

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fname}"`,
        // desabilita cache
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('GET /api/relatorios/rotas.xlsx error:', e);
    return NextResponse.json({ error: 'Erro ao gerar Excel' }, { status: 500 });
  }
}
