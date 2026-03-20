import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import ExcelJS from 'exceljs';

export async function GET(_req: NextRequest) {
  try {
    // Busca dados existentes no seu schema
    const rows = await prisma.coleta.findMany({
      select: {
        nf: true,
        cidade: true,
        uf: true,
        valorFrete: true,
        pesoTotalKg: true,
        clienteId: true,
      },
      // se der erro por falta de índice/ordenação, pode remover o orderBy
      orderBy: { nf: 'asc' },
    });

    // Monta workbook/planilha com exceljs
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Coletas');

    ws.columns = [
      { header: 'NF', key: 'nf', width: 16 },
      { header: 'Cidade', key: 'cidade', width: 24 },
      { header: 'UF', key: 'uf', width: 8 },
      { header: 'Valor do frete (R$)', key: 'valorFrete', width: 22 },
      { header: 'Peso total (kg)', key: 'pesoTotalKg', width: 20 },
      { header: 'Cliente ID', key: 'clienteId', width: 36 },
    ];

    for (const r of rows) {
      ws.addRow({
        nf: r.nf,
        cidade: r.cidade,
        uf: r.uf,
        valorFrete: r.valorFrete,
        pesoTotalKg: r.pesoTotalKg,
        clienteId: r.clienteId,
      });
    }

    // Cabeçalho em negrito
    ws.getRow(1).font = { bold: true };

    // Gera o buffer .xlsx
    const buffer = await wb.xlsx.writeBuffer();

    const filename = `coletas_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.xlsx`;

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    console.error('GET /api/coletas/export error:', e);
    return NextResponse.json({ error: 'Falha ao gerar planilha' }, { status: 500 });
  }
}
