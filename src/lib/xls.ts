import { NextResponse } from 'next/server';

/**
 * Shared XLS (HTML table format, vnd.ms-excel) generator.
 * Used by all API routes that previously generated CSV.
 */
export function buildXls(
  title: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const esc = (v: any) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const today = new Date().toLocaleDateString('pt-BR');
  const colCount = headers.length;

  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>Dados</x:Name></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
</head><body>
<table border="0" cellpadding="0" cellspacing="0">`;

  // Branding rows
  html += `<tr><td colspan="${colCount}" style="background:#1A4A1A;color:#FFFFFF;font-weight:bold;font-size:14pt;padding:8px 12px;font-family:Calibri,Arial,sans-serif">BR Transportes e Logística</td></tr>`;
  html += `<tr><td colspan="${colCount}" style="background:#F5BE16;color:#1A4A1A;font-weight:bold;font-size:11pt;padding:6px 12px;font-family:Calibri,Arial,sans-serif">${esc(title)}</td></tr>`;
  html += `<tr><td colspan="${colCount}" style="background:#f0fdf0;color:#475569;font-size:9pt;padding:4px 12px;border-bottom:1px solid #d1d5db;font-family:Calibri,Arial,sans-serif">Gerado em: ${today}</td></tr>`;

  // Column headers
  html +=
    '<tr>' +
    headers
      .map(
        (h) =>
          `<th style="background:#1A4A1A;color:#FFFFFF;font-weight:bold;font-size:10pt;padding:6px 10px;border:1px solid #0d2d0d;text-align:left;text-transform:uppercase;letter-spacing:0.5px;font-family:Calibri,Arial,sans-serif;white-space:nowrap">${esc(h)}</th>`,
      )
      .join('') +
    '</tr>';

  // Data rows (zebra)
  for (let r = 0; r < rows.length; r++) {
    const bg = r % 2 === 0 ? '#FFFFFF' : '#f0fdf4';
    html +=
      '<tr>' +
      rows[r]
        .map(
          (v) =>
            `<td style="background:${bg};padding:5px 10px;border:1px solid #e2e8f0;font-size:10pt;color:#1e293b;font-family:Calibri,Arial,sans-serif;vertical-align:middle">${esc(String(v ?? ''))}</td>`,
        )
        .join('') +
      '</tr>';
  }

  // Footer
  html += `<tr><td colspan="${colCount}" style="font-size:8pt;color:#94a3b8;padding:8px 12px;border:none;font-family:Calibri,Arial,sans-serif">BR Transportes e Logística — Sistema de Planejamento de Entregas — ${today}</td></tr>`;
  html += '</table></body></html>';
  return html;
}

export function xlsResponse(content: string, filename: string): NextResponse {
  const name = filename.replace(/\.csv$/i, '.xls');
  return new NextResponse('\uFEFF' + content, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.ms-excel;charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}
