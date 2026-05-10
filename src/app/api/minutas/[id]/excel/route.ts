import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import ExcelJS from 'exceljs';

type RouteContext = { params: Promise<{ id: string }> };

function fmtDate(v: any) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function dims(v: any): string {
  const a = v.alturaCm, b = v.larguraCm, c = v.comprimentoCm;
  if (!a && !b && !c) return '';
  return `${a ?? '-'} X ${b ?? '-'} X ${c ?? '-'}`;
}

// Colours matching BR Transportes brand
const GREEN  = '1A4A1A'; // dark green header
const LGGREEN = 'E8F5E9'; // light green rows
const WHITE  = 'FFFFFF';
const BLACK  = '000000';
const GOLD   = 'F5BE16';

function hdr(ws: ExcelJS.Worksheet, row: number, col: number, val: string) {
  const cell = ws.getCell(row, col);
  cell.value = val;
  cell.font = { bold: true, size: 10, color: { argb: 'FF' + GREEN } };
}

function val(ws: ExcelJS.Worksheet, row: number, col: number, v: any, opts?: Partial<ExcelJS.Style>) {
  const cell = ws.getCell(row, col);
  cell.value = v;
  if (opts?.font) cell.font = { size: 10, ...opts.font };
  if (opts?.alignment) cell.alignment = { wrapText: false, ...opts.alignment };
  if (opts?.fill) cell.fill = opts.fill as ExcelJS.Fill;
  if (opts?.border) cell.border = opts.border;
}

function border(ws: ExcelJS.Worksheet, row: number, col: number) {
  ws.getCell(row, col).border = {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  };
}

function fillCell(ws: ExcelJS.Worksheet, row: number, col: number, argb: string) {
  ws.getCell(row, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + argb } };
}

/**
 * GET /api/minutas/[id]/excel
 * Gera planilha Excel no formato exato da BKP_MINUTA
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
    const allVols = itensArr.flatMap((it: any) => (Array.isArray(it.volumes) ? it.volumes : []).map((v: any) => ({ ...v, _item: it })));

    // ─── Build workbook ───────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = 'BR Transportes';
    wb.created = new Date();

    // ─── Sheet 1: MINUTA ─────────────────────────────────────────
    const ws = wb.addWorksheet('MINUTA');

    // Column widths (A-N)
    ws.columns = [
      { width: 4 },   // A
      { width: 8 },   // B  QTDE
      { width: 36 },  // C  ITEM
      { width: 6 },   // D
      { width: 28 },  // E  MEDIDAS
      { width: 18 },  // F  ENDEREÇO
      { width: 14 },  // G  EMBARQUE
      { width: 20 },  // H  OBSERVAÇÃO
      { width: 6 },   // I
      { width: 6 },   // J
      { width: 6 },   // K
      { width: 6 },   // L
      { width: 6 },   // M
      { width: 6 },   // N
    ];

    // ── Row 1-6: Company header ──────────────────────────────────
    ws.mergeCells('B1:N1');
    const r1 = ws.getCell('B1');
    r1.value = 'BR TRANSPORTES E LOGÍSTICA';
    r1.font = { bold: true, size: 16, color: { argb: 'FF' + GREEN } };
    r1.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 24;

    ws.mergeCells('B2:N2');
    const r2 = ws.getCell('B2');
    r2.value = 'SÃO CARLOS - SP';
    r2.font = { size: 10, color: { argb: 'FF64748b' } };
    r2.alignment = { horizontal: 'center' };

    ws.mergeCells('B3:N3');
    const r3 = ws.getCell('B3');
    r3.value = 'MINUTA DE CONFERÊNCIA';
    r3.font = { bold: true, size: 13, color: { argb: 'FF' + GREEN } };
    r3.alignment = { horizontal: 'center' };
    ws.getRow(3).height = 20;

    ws.mergeCells('B4:N4');
    ws.getRow(4).height = 6;

    // ── Row 5: Separator line ────────────────────────────────────
    for (let c = 2; c <= 14; c++) {
      fillCell(ws, 5, c, GREEN);
    }
    ws.getRow(5).height = 4;

    // ── Row 6: spacer ────────────────────────────────────────────
    ws.getRow(6).height = 6;

    // ── Row 7: NF + CONF.EMBARQUE ───────────────────────────────
    ws.getRow(7).height = 18;
    hdr(ws, 7, 2, 'NOTA FISCAL:');
    val(ws, 7, 3, minuta.nfNumero, { font: { bold: true, size: 11, color: { argb: 'FF' + BLACK } } });
    // merge C7:E7
    ws.mergeCells(7, 3, 7, 5);
    hdr(ws, 7, 6, 'CONF.EMBARQUE:');
    // merge F7:G7
    ws.mergeCells(7, 6, 7, 7);
    val(ws, 7, 8, allVols.length, { font: { bold: true, size: 13, color: { argb: 'FF' + GREEN } } });

    // ── Row 8: CLIENTE ───────────────────────────────────────────
    ws.getRow(8).height = 16;
    hdr(ws, 8, 2, 'CLIENTE:');
    ws.mergeCells(8, 3, 8, 8);
    val(ws, 8, 3, minuta.cliente, { font: { bold: true, size: 11, color: { argb: 'FF' + BLACK } } });

    // ── Row 9: DESTINO ───────────────────────────────────────────
    ws.getRow(9).height = 16;
    hdr(ws, 9, 2, 'DESTINO: CIDADE:');
    ws.mergeCells(9, 3, 9, 5);
    val(ws, 9, 3, minuta.cidade, { font: { bold: true, size: 11 } });
    hdr(ws, 9, 6, 'UF:');
    val(ws, 9, 7, minuta.uf, { font: { bold: true, size: 11 } });

    // ── Row 10: spacer ───────────────────────────────────────────
    ws.getRow(10).height = 6;

    // ── Row 11: PEDIDO + DATA COLETA ─────────────────────────────
    ws.getRow(11).height = 16;
    hdr(ws, 11, 2, 'PEDIDO:');
    ws.mergeCells(11, 3, 11, 5);
    val(ws, 11, 3, minuta.pedido ?? '', { font: { bold: true, size: 11 } });
    hdr(ws, 11, 6, 'DATA - COLETA:');
    ws.mergeCells(11, 6, 11, 7);
    val(ws, 11, 8, fmtDate(minuta.dataColeta), { font: { bold: true, size: 11 } });

    // ── Row 12: COLETADOR ────────────────────────────────────────
    ws.getRow(12).height = 16;
    hdr(ws, 12, 2, 'COLETADOR:');
    ws.mergeCells(12, 3, 12, 5);
    val(ws, 12, 3, minuta.coletador ?? '', { font: { bold: true, size: 11 } });

    // ── Row 13: Item header (MARCA | DESCRIÇÃO | PESO) ───────────
    let currentRow = 13;

    for (const it of itensArr) {
      const vols: any[] = Array.isArray(it.volumes) ? it.volumes : [];
      const itPeso = vols.reduce((s: number, v: any) => s + (isFinite(Number(v.pesoKg)) ? Number(v.pesoKg) : 0), 0);

      ws.getRow(currentRow).height = 16;
      // MARCA header row
      const marcaCell = ws.getCell(currentRow, 2);
      marcaCell.value = 'MARCA';
      marcaCell.font = { bold: true, size: 10, color: { argb: 'FF' + WHITE } };
      fillCell(ws, currentRow, 2, GREEN);
      border(ws, currentRow, 2);

      ws.mergeCells(currentRow, 3, currentRow, 3);
      const marcaVal = ws.getCell(currentRow, 3);
      marcaVal.value = minuta.marca ?? '';
      marcaVal.font = { bold: true, size: 11, color: { argb: 'FF' + BLACK } };
      fillCell(ws, currentRow, 3, LGGREEN.replace('#', ''));

      const descHdr = ws.getCell(currentRow, 4);
      descHdr.value = 'DESCRIÇÃO:';
      descHdr.font = { bold: true, size: 10, color: { argb: 'FF' + WHITE } };
      fillCell(ws, currentRow, 4, GREEN);
      border(ws, currentRow, 4);
      ws.mergeCells(currentRow, 5, currentRow, 7);
      const descVal = ws.getCell(currentRow, 5);
      descVal.value = it.produtoDescricao;
      descVal.font = { bold: true, size: 10 };

      const pesoHdr = ws.getCell(currentRow, 8);
      pesoHdr.value = 'PESO:';
      pesoHdr.font = { bold: true, size: 10, color: { argb: 'FF' + WHITE } };
      fillCell(ws, currentRow, 8, GREEN);
      border(ws, currentRow, 8);
      const pesoVal = ws.getCell(currentRow, 9);
      pesoVal.value = itPeso > 0 ? `${itPeso.toFixed(0)} KG` : '';
      pesoVal.font = { bold: true, size: 10 };

      currentRow++;

      // QUANT row
      ws.getRow(currentRow).height = 14;
      const qtdHdr = ws.getCell(currentRow, 2);
      qtdHdr.value = 'QUANT.';
      qtdHdr.font = { bold: true, size: 10, color: { argb: 'FF' + WHITE } };
      fillCell(ws, currentRow, 2, '1A4A1A');
      border(ws, currentRow, 2);
      const qtdVal = ws.getCell(currentRow, 3);
      qtdVal.value = it.quantidade;
      qtdVal.font = { bold: true, size: 11 };
      ws.mergeCells(currentRow, 4, currentRow, 9);
      const codeVal = ws.getCell(currentRow, 4);
      codeVal.value = `${it.produtoCode}`;
      codeVal.font = { size: 10, color: { argb: 'FF475569' } };

      currentRow++;

      // Volumes header row
      ws.getRow(currentRow).height = 14;
      const colHeaders = ['QTDE', 'ITEM', '', 'MEDIDAS', 'ENDEREÇO', 'EMBARQUE', 'OBSERVAÇÃO'];
      const colStart = 2;
      const colMap = [2, 3, 4, 5, 6, 7, 8];
      const colMerge = [
        [2, 2],   // QTDE
        [3, 4],   // ITEM (merge C:D)
        null,     // skip D
        [5, 5],   // MEDIDAS
        [6, 6],   // ENDEREÇO
        [7, 7],   // EMBARQUE
        [8, 9],   // OBSERVAÇÃO (merge H:I)
      ];
      for (let i = 0; i < colHeaders.length; i++) {
        if (colHeaders[i] === '') continue;
        const [mc, mc2] = colMerge[i] ?? [colMap[i], colMap[i]];
        if (mc !== mc2) ws.mergeCells(currentRow, mc, currentRow, mc2);
        const cell = ws.getCell(currentRow, mc);
        cell.value = colHeaders[i];
        cell.font = { bold: true, size: 10, color: { argb: 'FF' + WHITE } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GREEN } };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      }
      currentRow++;

      // Volume rows
      for (let vi = 0; vi < vols.length; vi++) {
        const v = vols[vi];
        const bg = vi % 2 === 0 ? 'F0FDF4' : WHITE;
        ws.getRow(currentRow).height = 14;

        // QTDE
        const cQtd = ws.getCell(currentRow, 2);
        cQtd.value = vi + 1;
        cQtd.alignment = { horizontal: 'center' };
        fillCell(ws, currentRow, 2, bg);
        border(ws, currentRow, 2);

        // ITEM (C:D merged)
        ws.mergeCells(currentRow, 3, currentRow, 4);
        const cItem = ws.getCell(currentRow, 3);
        cItem.value = v.descricao;
        cItem.font = { size: 9 };
        fillCell(ws, currentRow, 3, bg);
        border(ws, currentRow, 3);

        // MEDIDAS
        const cMed = ws.getCell(currentRow, 5);
        cMed.value = dims(v);
        cMed.alignment = { horizontal: 'center' };
        cMed.font = { size: 9 };
        fillCell(ws, currentRow, 5, bg);
        border(ws, currentRow, 5);

        // ENDEREÇO
        const cEnd = ws.getCell(currentRow, 6);
        cEnd.value = v.endereco ?? '';
        cEnd.alignment = { horizontal: 'center' };
        cEnd.font = { size: 9 };
        fillCell(ws, currentRow, 6, bg);
        border(ws, currentRow, 6);

        // EMBARQUE
        const cEmb = ws.getCell(currentRow, 7);
        cEmb.value = v.embarque ?? '';
        cEmb.alignment = { horizontal: 'center' };
        cEmb.font = { size: 9 };
        fillCell(ws, currentRow, 7, bg);
        border(ws, currentRow, 7);

        // OBSERVAÇÃO (H:I merged)
        ws.mergeCells(currentRow, 8, currentRow, 9);
        const cObs = ws.getCell(currentRow, 8);
        cObs.value = v.observacao ?? '';
        cObs.font = { size: 9 };
        fillCell(ws, currentRow, 8, bg);
        border(ws, currentRow, 8);

        currentRow++;
      }

      // spacer between items
      ws.getRow(currentRow).height = 6;
      currentRow++;
    }

    // ── VOLUMES total row ─────────────────────────────────────────
    ws.getRow(currentRow).height = 18;
    ws.mergeCells(currentRow, 2, currentRow, 3);
    const volHdr = ws.getCell(currentRow, 2);
    volHdr.value = 'VOLUMES:';
    volHdr.font = { bold: true, size: 12, color: { argb: 'FF' + WHITE } };
    volHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GREEN } };
    volHdr.alignment = { horizontal: 'right', vertical: 'middle' };
    volHdr.border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'medium' }, right: { style: 'medium' } };

    const volVal = ws.getCell(currentRow, 4);
    volVal.value = allVols.length;
    volVal.font = { bold: true, size: 14, color: { argb: 'FF' + GREEN } };
    volVal.alignment = { horizontal: 'center', vertical: 'middle' };
    volVal.border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'medium' }, right: { style: 'medium' } };

    currentRow += 2;

    // ── Signature row ─────────────────────────────────────────────
    ws.getRow(currentRow).height = 24;
    const sigLabels = ['CONFERENTE', 'MOTORISTA', 'RESPONSÁVEL EXPEDIÇÃO'];
    const sigCols = [[2, 3], [5, 6], [7, 8]];
    for (let i = 0; i < sigLabels.length; i++) {
      const [sc, ec] = sigCols[i];
      ws.mergeCells(currentRow, sc, currentRow, ec);
      const sigCell = ws.getCell(currentRow, sc);
      sigCell.value = sigLabels[i];
      sigCell.font = { bold: true, size: 9, color: { argb: 'FF475569' } };
      sigCell.alignment = { horizontal: 'center', vertical: 'bottom' };
      sigCell.border = { top: { style: 'medium', color: { argb: 'FF' + GREEN } } };
    }

    // ─── Sheet 2: DECLARAÇÃO ─────────────────────────────────────
    const wsDec = wb.addWorksheet('DECLARAÇÃO');
    wsDec.columns = [
      { width: 4 },
      { width: 50 },
      { width: 20 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
    ];

    let dr = 1;

    // Company header
    wsDec.mergeCells(dr, 2, dr, 6);
    const dh = wsDec.getCell(dr, 2);
    dh.value = 'BR TRANSPORTES E LOGÍSTICA';
    dh.font = { bold: true, size: 16, color: { argb: 'FF' + GREEN } };
    dh.alignment = { horizontal: 'center' };
    wsDec.getRow(dr).height = 24;
    dr++;

    wsDec.mergeCells(dr, 2, dr, 6);
    const dh2 = wsDec.getCell(dr, 2);
    dh2.value = 'DECLARAÇÃO DE RECEBIMENTO DE VOLUMES';
    dh2.font = { bold: true, size: 13, color: { argb: 'FF' + GREEN } };
    dh2.alignment = { horizontal: 'center' };
    wsDec.getRow(dr).height = 20;
    dr++;
    dr++; // spacer

    const decInfos: [string, string][] = [
      ['NOTA FISCAL:', minuta.nfNumero],
      ['CLIENTE:', minuta.cliente],
      ['DESTINO:', `${minuta.cidade} - ${minuta.uf}`],
      ['PEDIDO:', minuta.pedido ?? '-'],
      ['DATA COLETA:', fmtDate(minuta.dataColeta)],
      ['TOTAL VOLUMES:', String(allVols.length)],
    ];

    for (const [label, value] of decInfos) {
      wsDec.getCell(dr, 2).value = label;
      wsDec.getCell(dr, 2).font = { bold: true, size: 10, color: { argb: 'FF' + GREEN } };
      wsDec.mergeCells(dr, 3, dr, 6);
      wsDec.getCell(dr, 3).value = value;
      wsDec.getCell(dr, 3).font = { bold: true, size: 10 };
      wsDec.getRow(dr).height = 14;
      dr++;
    }
    dr++;

    // Declaration text
    wsDec.mergeCells(dr, 2, dr, 6);
    const decText = wsDec.getCell(dr, 2);
    decText.value = 'Declaro ter recebido em perfeitas condições os volumes relacionados abaixo, correspondentes à Nota Fiscal indicada acima.';
    decText.font = { italic: true, size: 10 };
    decText.alignment = { wrapText: true };
    wsDec.getRow(dr).height = 28;
    dr++;
    dr++;

    // Volume list header
    const decHdrs = ['Nº', 'DESCRIÇÃO DO VOLUME', 'MEDIDAS', 'PESO (KG)', 'ETIQUETA'];
    const decColStart = [2, 3, 4, 5, 6];
    for (let i = 0; i < decHdrs.length; i++) {
      const cell = wsDec.getCell(dr, decColStart[i]);
      cell.value = decHdrs[i];
      cell.font = { bold: true, size: 10, color: { argb: 'FF' + WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GREEN } };
      cell.alignment = { horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    }
    wsDec.getRow(dr).height = 14;
    dr++;

    // Volume rows
    for (let vi = 0; vi < allVols.length; vi++) {
      const v = allVols[vi];
      const bg = vi % 2 === 0 ? 'F0FDF4' : WHITE;
      wsDec.getRow(dr).height = 13;
      const dCols = [String(vi + 1), v.descricao, dims(v), v.pesoKg != null ? String(Number(v.pesoKg).toFixed(2)) : '', v.etiqueta];
      for (let i = 0; i < decColStart.length; i++) {
        const cell = wsDec.getCell(dr, decColStart[i]);
        cell.value = dCols[i];
        cell.font = { size: 9 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        if (i === 0) cell.alignment = { horizontal: 'center' };
      }
      dr++;
    }
    dr += 3;

    // Signature
    wsDec.mergeCells(dr, 2, dr, 4);
    const sigDec = wsDec.getCell(dr, 2);
    sigDec.value = 'Assinatura do Destinatário / Responsável pelo Recebimento';
    sigDec.font = { size: 9, color: { argb: 'FF475569' } };
    sigDec.alignment = { horizontal: 'center' };
    sigDec.border = { top: { style: 'medium', color: { argb: 'FF' + GREEN } } };

    // ─── Serialize ───────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();

    const filename = `Minuta_NF${minuta.nfNumero}_${fmtDate(new Date()).replace(/\//g, '-')}.xlsx`;

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    console.error('GET /api/minutas/[id]/excel error:', e);
    return NextResponse.json({ error: e?.message || 'Falha ao gerar Excel' }, { status: 500 });
  }
}
