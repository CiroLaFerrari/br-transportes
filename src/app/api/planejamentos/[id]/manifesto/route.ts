import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    // Query params opcionais (não grava em DB, só imprime no PDF)
    const url = new URL(req.url);
    const motoristaNome = url.searchParams.get('motoristaNome') || '';
    const motoristaDoc  = url.searchParams.get('motoristaDoc')  || '';
    const veiculoPlaca  = url.searchParams.get('veiculoPlaca')  || '';
    const veiculoCapKg  = url.searchParams.get('veiculoCapKg')  || '';

    // Busca o Planejamento (assumindo que existe a tabela/rota já usada por você)
    // Ajuste os selects/nomes conforme seu schema real:
    const plan = await prisma.planejamento.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        payload: true, // assumindo que você salvou a rota/legs dentro de payload (JSON)
        createdAt: true,
      },
    });

    if (!plan) {
      return NextResponse.json({ error: 'Planejamento não encontrado' }, { status: 404 });
    }
    if (!plan.payload) {
      return NextResponse.json({ error: 'Planejamento sem payload de rota' }, { status: 400 });
    }

    // Esperando payload no formato que já usamos antes:
    // {
    //   points: [{label, lon, lat}, ...],
    //   legs: [{from, to, km, dur_min}, ...],
    //   total_km: number,
    //   total_dur_min: number
    // }
    const payload: any = plan.payload;

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);

    const pageW = 595.28, pageH = 841.89;
    const margin = 40, lineH = 16;

    function addPage() { return pdf.addPage([pageW, pageH]); }
    function header(page: any) {
      const title = `Manifesto • Planejamento`;
      const stamp = `Gerado em: ${new Date().toLocaleString('pt-BR')}`;

      page.drawText(title, { x: margin, y: pageH - margin, size: 16, font: fontB, color: rgb(0.1,0.15,0.22) });
      page.drawText(stamp, {
        x: pageW - margin - font.widthOfTextAtSize(stamp, 10),
        y: pageH - margin,
        size: 10, font, color: rgb(0.2,0.2,0.2)
      });

      page.drawLine({
        start: { x: margin, y: pageH - margin - 6 },
        end:   { x: pageW - margin, y: pageH - margin - 6 },
        thickness: 1, color: rgb(0.6,0.65,0.7)
      });
    }

    const page = addPage();
    header(page);

    let y = pageH - margin - 28;

    // Dados do planejamento
    const name = plan.name || plan.id;
    page.drawText(`Planejamento: ${name}`, { x: margin, y, size: 12, font: fontB }); y -= lineH;

    // Dados opcionais do motorista/veículo
    if (motoristaNome || motoristaDoc) {
      page.drawText(`Motorista: ${motoristaNome || '-'}`, { x: margin, y, size: 11, font }); y -= lineH;
      if (motoristaDoc) { page.drawText(`Documento: ${motoristaDoc}`, { x: margin, y, size: 11, font }); y -= lineH; }
    }
    if (veiculoPlaca || veiculoCapKg) {
      page.drawText(`Veículo (placa): ${veiculoPlaca || '-'}`, { x: margin, y, size: 11, font }); y -= lineH;
      if (veiculoCapKg) { page.drawText(`Capacidade (kg): ${veiculoCapKg}`, { x: margin, y, size: 11, font }); y -= lineH; }
    }

    y -= 6;
    page.drawLine({
      start: { x: margin, y }, end: { x: pageW - margin, y },
      thickness: 0.7, color: rgb(0.6,0.65,0.7)
    }); y -= 14;

    // Tabela das legs
    const cols = [
      { header: 'Origem', key: 'from' as const, width: 180 },
      { header: 'Destino', key: 'to' as const,  width: 180 },
      { header: 'Distância (km)', key: 'km' as const, width: 90 },
      { header: 'Duração (min)', key: 'dur_min' as const, width: 90 },
    ];

    // Cabeçalho da tabela
    let x = margin;
    cols.forEach(c => {
      page.drawText(c.header, { x, y, size: 11, font: fontB });
      x += c.width;
    });
    y -= 12;
    page.drawLine({
      start: { x: margin, y }, end: { x: pageW - margin, y },
      thickness: 0.5, color: rgb(0.8,0.8,0.8)
    });
    y -= 10;

    const legs: Array<any> = Array.isArray(payload?.legs) ? payload.legs : [];

    const fmtKm = (v:any)=> Number.isFinite(Number(v)) ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(Number(v)) : '';
    const fmtMin= (v:any)=> Number.isFinite(Number(v)) ? new Intl.NumberFormat('pt-BR').format(Number(v)) : '';

    for (const row of legs) {
      if (y < margin + 60) {
        const p2 = addPage(); header(p2); y = pageH - margin - 28;
      }
      x = margin;

      const values: Record<string, string> = {
        from: String(row?.from ?? ''),
        to: String(row?.to ?? ''),
        km: fmtKm(row?.km),
        dur_min: fmtMin(row?.dur_min),
      };

      cols.forEach(c => {
        const text = String(values[c.key] ?? '');
        page.drawText(text, { x, y, size: 10, font });
        x += c.width;
      });

      y -= 14;
      page.drawLine({
        start: { x: margin, y }, end: { x: pageW - margin, y },
        thickness: 0.3, color: rgb(0.9,0.9,0.9)
      });
      y -= 6;
    }

    // Totais
    y -= 10;
    const totalKm = payload?.total_km ?? null;
    const totalMin = payload?.total_dur_min ?? null;

    if (y < margin + 40) {
      const p3 = addPage(); header(p3); y = pageH - margin - 28;
    }
    page.drawText(`Total: ${fmtKm(totalKm)} km • ${fmtMin(totalMin)} min`, {
      x: margin, y, size: 12, font: fontB, color: rgb(0.1,0.15,0.22)
    });

    const bytes = await pdf.save();
    const filename = `manifesto_planejamento_${name.replace(/\s+/g,'_')}.pdf`;

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e:any) {
    console.error('GET /api/planejamentos/[id]/manifesto error:', e);
    return NextResponse.json({ error: 'Falha ao gerar PDF do planejamento' }, { status: 500 });
  }
}
