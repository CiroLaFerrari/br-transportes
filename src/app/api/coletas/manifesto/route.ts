import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function GET(_req: NextRequest) {
  try {
    // Busca os dados existentes
    const rows = await prisma.coleta.findMany({
      select: {
        nf: true,
        cidade: true,
        uf: true,
        valorFrete: true,
        pesoTotalKg: true,
        clienteId: true,
      },
      orderBy: { nf: 'asc' }, // se não for ordenável, pode remover
    });

    // Cria o PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Config de layout
    const pageWidth = 595.28;   // A4 width (pt)
    const pageHeight = 841.89;  // A4 height (pt)
    const margin = 40;
    const lineH = 16;

    // Colunas
    const cols = [
      { header: 'NF',        key: 'nf' as const,          width: 60 },
      { header: 'Cidade',    key: 'cidade' as const,      width: 170 },
      { header: 'UF',        key: 'uf' as const,          width: 30 },
      { header: 'Peso (kg)', key: 'pesoTotalKg' as const, width: 70 },
      { header: 'Frete (R$)',key: 'valorFrete' as const,  width: 80 },
      { header: 'Cliente ID',key: 'clienteId' as const,   width: 145 },
    ];

    function addPage() {
      const pg = pdfDoc.addPage([pageWidth, pageHeight]);
      return pg;
    }

    // Cabeçalho da página
    function drawHeader(page: any, yStart: number) {
      const title = 'Manifesto de Coletas';
      page.drawText(title, {
        x: margin,
        y: yStart,
        size: 16,
        font: fontBold,
        color: rgb(0.15, 0.2, 0.28),
      });
      const stamp = `Gerado em: ${new Date().toLocaleString('pt-BR')}`;
      page.drawText(stamp, {
        x: pageWidth - margin - font.widthOfTextAtSize(stamp, 10),
        y: yStart,
        size: 10,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });

      // Linha abaixo do título
      page.drawLine({
        start: { x: margin, y: yStart - 6 },
        end: { x: pageWidth - margin, y: yStart - 6 },
        thickness: 1,
        color: rgb(0.6, 0.65, 0.7),
      });

      // Cabeçalho da tabela
      let x = margin;
      const headerY = yStart - 22;
      cols.forEach(c => {
        page.drawText(c.header, { x, y: headerY, size: 11, font: fontBold, color: rgb(0, 0, 0) });
        x += c.width;
      });

      // Linha abaixo do cabeçalho
      page.drawLine({
        start: { x: margin, y: headerY - 4 },
        end: { x: pageWidth - margin, y: headerY - 4 },
        thickness: 0.7,
        color: rgb(0.6, 0.65, 0.7),
      });

      return headerY - 12; // y inicial das linhas
    }

    // Cria a primeira página
    let page = addPage();
    let y = drawHeader(page, pageHeight - margin);

    // Desenha linhas
    for (const r of rows) {
      // Quebra de página
      if (y < margin + 40) {
        page = addPage();
        y = drawHeader(page, pageHeight - margin);
      }

      let x = margin;

      // Helpers de formatação
      const fmtPeso = (v?: number | null) =>
        typeof v === 'number' && Number.isFinite(v) ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(v) : '';
      const fmtMoney = (v?: number | null) =>
        typeof v === 'number' && Number.isFinite(v) ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '';

      const rowValues: Record<string, string> = {
        nf: String(r.nf ?? ''),
        cidade: String(r.cidade ?? ''),
        uf: String(r.uf ?? ''),
        pesoTotalKg: fmtPeso(r.pesoTotalKg),
        valorFrete: fmtMoney(r.valorFrete),
        clienteId: String(r.clienteId ?? ''),
      };

      // Escreve cada coluna (corta texto se ultrapassar largura)
      cols.forEach((c) => {
        const raw = rowValues[c.key] ?? '';
        const maxWidth = c.width - 4;
        let text = raw;
        // corta rudimentar (p/ não explodir layout)
        while (font.widthOfTextAtSize(text, 10) > maxWidth && text.length > 0) {
          text = text.slice(0, -1);
        }
        page.drawText(text, { x, y, size: 10, font, color: rgb(0, 0, 0) });
        x += c.width;
      });

      // linha separadora
      page.drawLine({
        start: { x: margin, y: y - 3 },
        end: { x: pageWidth - margin, y: y - 3 },
        thickness: 0.3,
        color: rgb(0.85, 0.85, 0.85),
      });

      y -= lineH;
    }

    // Rodapé simples com contagem
    const totalTxt = `Total de coletas: ${rows.length}`;
    page.drawText(totalTxt, {
      x: margin,
      y: margin,
      size: 10,
      font: fontBold,
      color: rgb(0.15, 0.2, 0.28),
    });

    // Finaliza
    const pdfBytes = await pdfDoc.save();

    const filename = `manifesto_coletas_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.pdf`;
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    console.error('GET /api/coletas/manifesto error:', e);
    return NextResponse.json({ error: 'Falha ao gerar PDF' }, { status: 500 });
  }
}
