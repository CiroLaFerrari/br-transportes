import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import ExcelJS from 'exceljs';

// GET /api/planejamentos/:id/xlsx  -> retorna arquivo .xlsx com a tabela (legs + total)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const plan = await prisma.planStore.findUnique({ where: { id } });
    if (!plan) {
      return NextResponse.json({ error: 'Planejamento não encontrado' }, { status: 404 });
    }

    // payload esperado: { points, legs, total_km, total_dur_min }
    const payload: any = plan.payload ?? {};
    const legs: any[] = Array.isArray(payload.legs) ? payload.legs : [];
    const totalKm = Number(payload.total_km ?? 0);
    const totalMin = Number(payload.total_dur_min ?? 0);

    // Normalizador: garante km/min mesmo se vier distance/duration em metros/segundos
    const norm = (l: any) => {
      const km =
        typeof l?.km === 'number'
          ? l.km
          : typeof l?.distance === 'number'
            ? (l.distance > 1000 ? l.distance / 1000 : l.distance)
            : 0;

      const durMin =
        typeof l?.dur_min === 'number'
          ? l.dur_min
          : typeof l?.duration === 'number'
            ? Math.round(l.duration / 60)
            : 0;

      return {
        from: String(l?.from ?? ''),
        to: String(l?.to ?? ''),
        km: Number(km || 0),
        durMin: Number(durMin || 0),
      };
    };

    const rows = legs.map(norm);

    // Monta o Excel em memória
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Planejamento');

    // Cabeçalho
    ws.columns = [
      { header: 'Origem',   key: 'from',   width: 40 },
      { header: 'Destino',  key: 'to',     width: 40 },
      { header: 'Distância (km)', key: 'km', width: 18 },
      { header: 'Duração (min)',  key: 'dur', width: 18 },
    ];

    // Linhas das pernas
    for (const r of rows) {
      ws.addRow({
        from: r.from.replace(/, Brasil$/i, ''),
        to:   r.to.replace(/, Brasil$/i, ''),
        km:   Number(r.km.toFixed(2)),
        dur:  r.durMin,
      });
    }

    // Linha em branco
    ws.addRow({});

    // Totais
    const totalRow = ws.addRow({
      from: '',
      to: 'TOTAL',
      km: Number(totalKm.toFixed(2)),
      dur: totalMin,
    });

    // Estiliza header e total
    const header = ws.getRow(1);
    header.font = { bold: true };
    totalRow.font = { bold: true };

    // Gera o arquivo (.xlsx) na memória
    const buffer = await wb.xlsx.writeBuffer();

    // Retorna como download
    const filename = `planejamento_${plan.name.replace(/[^\w\-]+/g, '_')}_${id}.xlsx`;
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    console.error('GET /api/planejamentos/:id/xlsx error:', e?.message || e);
    return NextResponse.json({ error: 'Falha ao gerar XLSX' }, { status: 500 });
  }
}
