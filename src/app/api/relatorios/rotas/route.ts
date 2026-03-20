import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

function parseDateOnly(s?: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 0, 0, 0));
  return isNaN(d.getTime()) ? null : d;
}

type Sep = 'semicolon' | 'comma' | 'tab';
type Dec = 'comma' | 'dot';
type Lang = 'pt' | 'en';

function getSepChar(sep: Sep) {
  if (sep === 'comma') return ',';
  if (sep === 'tab') return '\t';
  return ';'; // default: semicolon
}

function csvEscape(v: any, sepChar: string) {
  const s = String(v ?? '');
  // se tiver separador, aspas ou quebra de linha -> quotar
  if (s.includes(sepChar) || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fmtNumber(n: number, dec: Dec) {
  if (!isFinite(n)) return '';
  const s = String(n);
  if (dec === 'comma') return s.replace('.', ',');
  return s;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const dateFromStr = url.searchParams.get('dateFrom');
    const dateToStr   = url.searchParams.get('dateTo');
    const format      = (url.searchParams.get('format') || 'json').toLowerCase();

    const costPerKmParam = url.searchParams.get('costPerKm');
    const costPerKm = costPerKmParam ? Number(costPerKmParam) : 0;

    // novos parâmetros
    const sep: Sep = (url.searchParams.get('sep') as Sep) || 'semicolon'; // semicolon (;) é padrão BR
    const dec: Dec = (url.searchParams.get('decimal') as Dec) || 'comma'; // vírgula é padrão BR
    const headers: Lang = (url.searchParams.get('headers') as Lang) || 'pt';
    const detail = url.searchParams.get('detail') === '1'; // se 1, inclui paradas linha a linha

    // período padrão: hoje
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
      include: { stops: { orderBy: { order: 'asc' } } }
    });

    const totalKm = rotas.reduce((s, r) => s + (r.totalKm || 0), 0);
    const totalCost = costPerKm > 0 ? Number((totalKm * costPerKm).toFixed(2)) : 0;

    if (format === 'csv') {
      const sepChar = getSepChar(sep);
      const bom = '\uFEFF'; // BOM para Excel no Windows abrir UTF-8 com acentos

      const headerMainPT = ['id','dataHora','origem','totalKm','qtdParadas','listaParadas'];
      const headerMainEN = ['id','createdAt','origin','totalKm','stopsCount','stopsList'];
      const headerStopPT = ['idRota','ordem','destino','km','min'];
      const headerStopEN = ['routeId','order','destination','km','min'];

      const lines: string[] = [];

      // cabeçalho resumo
      lines.push(
        (headers === 'pt' ? headerMainPT : headerMainEN)
          .map(h => csvEscape(h, sepChar)).join(sepChar)
      );

      // linhas resumo por rota
      for (const r of rotas) {
        const stopsList = r.stops.map(s => s.destination).join(' | ');
        const row = [
          r.id,
          new Date(r.createdAt).toISOString(),
          r.origin,
          fmtNumber(Number(r.totalKm ?? 0), dec),
          String(r.stops.length),
          stopsList
        ].map(v => csvEscape(v, sepChar)).join(sepChar);
        lines.push(row);
      }

      // bloco detalhado (paradas) opcional
      if (detail) {
        lines.push(''); // linha em branco separadora
        lines.push(
          (headers === 'pt' ? headerStopPT : headerStopEN)
            .map(h => csvEscape(h, sepChar)).join(sepChar)
        );
        for (const r of rotas) {
          for (const s of r.stops) {
            const row = [
              r.id,
              String(s.order),
              s.destination,
              fmtNumber(Number(s.km ?? 0), dec),
              String(s.durMin ?? 0),
            ].map(v => csvEscape(v, sepChar)).join(sepChar);
            lines.push(row);
          }
        }
      }

      const csv = bom + lines.join('\n');
      const fname = `rotas_${dFrom.toISOString().slice(0,10)}_${dToInc.toISOString().slice(0,10)}.csv`;
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fname}"`,
        }
      });
    }

    // JSON (default)
    return NextResponse.json({
      period: { from: dFrom.toISOString(), to_inclusive: dToInc.toISOString() },
      totals: {
        routes: rotas.length,
        km: Number(totalKm.toFixed(2)),
        cost: totalCost,
        costPerKm: costPerKm || null,
      },
      data: rotas
    });
  } catch (e) {
    console.error('GET /api/relatorios/rotas error:', e);
    return NextResponse.json({ error: 'Erro ao gerar relatório' }, { status: 500 });
  }
}
