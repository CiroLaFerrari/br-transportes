import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function msToDays(ms: number) {
  return Math.round((ms / (1000 * 60 * 60 * 24)) * 100) / 100;
}

/**
 * GET /api/relatorios/patio?dateFrom=2025-01-01&dateTo=2025-12-31&status=ALL
 *
 * Retorna análise de lead time do pátio com:
 * - Lista de coletas com lead time calculado
 * - Métricas agregadas (média, máximo, distribuição)
 * - Análise por UF
 * - Análise por cliente
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const dateFromStr = searchParams.get('dateFrom') || '';
    const dateToStr = searchParams.get('dateTo') || '';
    const statusFilter = (searchParams.get('status') || 'ALL').toUpperCase();

    const where: any = {};

    if (dateFromStr) {
      where.entradaPatioAt = { ...(where.entradaPatioAt || {}), gte: new Date(dateFromStr) };
    }
    if (dateToStr) {
      const to = new Date(dateToStr);
      to.setHours(23, 59, 59, 999);
      where.entradaPatioAt = { ...(where.entradaPatioAt || {}), lte: to };
    }

    if (statusFilter !== 'ALL') {
      const allowed = ['EM_PATIO', 'CARREGADA', 'EM_TRANSITO', 'ENTREGUE'];
      if (allowed.includes(statusFilter)) {
        where.status = statusFilter;
      }
    }

    const coletas = await prisma.coleta.findMany({
      where,
      orderBy: { entradaPatioAt: 'asc' },
      select: {
        id: true,
        nf: true,
        cidade: true,
        uf: true,
        status: true,
        pesoTotalKg: true,
        valorFrete: true,
        entradaPatioAt: true,
        embarqueAt: true,
        fimPatioAt: true,
        Cliente: { select: { razao: true } },
      },
    });

    const now = new Date();

    // Calcular lead time para cada coleta
    const rows = coletas.map((c) => {
      const entrada = c.entradaPatioAt;
      const fim = c.fimPatioAt ?? c.embarqueAt;
      const aberto = !fim && c.status === 'EM_PATIO';

      let leadTimeDias: number | null = null;
      if (entrada) {
        const ref = fim ?? now;
        leadTimeDias = msToDays(ref.getTime() - entrada.getTime());
      }

      return {
        id: c.id,
        nf: c.nf,
        cidade: c.cidade,
        uf: c.uf,
        status: c.status,
        cliente: c.Cliente?.razao || '—',
        pesoTotalKg: c.pesoTotalKg,
        valorFrete: c.valorFrete,
        entradaPatioAt: c.entradaPatioAt,
        fimPatioAt: fim,
        aberto,
        leadTimeDias,
      };
    });

    // Métricas agregadas
    const leadTimes = rows
      .map((r) => r.leadTimeDias)
      .filter((n): n is number => n != null && Number.isFinite(n));

    const totalColetas = rows.length;
    const coletasAberto = rows.filter((r) => r.aberto).length;
    const coletasFechado = totalColetas - coletasAberto;

    const mediaDias = leadTimes.length > 0
      ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length
      : null;
    const maxDias = leadTimes.length > 0 ? Math.max(...leadTimes) : null;
    const minDias = leadTimes.length > 0 ? Math.min(...leadTimes) : null;

    // Distribuição por faixa
    const faixas = { ate3: 0, ate7: 0, ate15: 0, ate30: 0, acima30: 0 };
    for (const d of leadTimes) {
      if (d <= 3) faixas.ate3++;
      else if (d <= 7) faixas.ate7++;
      else if (d <= 15) faixas.ate15++;
      else if (d <= 30) faixas.ate30++;
      else faixas.acima30++;
    }

    // Análise por UF
    const porUf: Record<string, { count: number; somaDias: number; maxDias: number }> = {};
    for (const r of rows) {
      if (!porUf[r.uf]) porUf[r.uf] = { count: 0, somaDias: 0, maxDias: 0 };
      porUf[r.uf].count++;
      if (r.leadTimeDias != null) {
        porUf[r.uf].somaDias += r.leadTimeDias;
        if (r.leadTimeDias > porUf[r.uf].maxDias) porUf[r.uf].maxDias = r.leadTimeDias;
      }
    }
    const analiseUf = Object.entries(porUf)
      .map(([uf, v]) => ({
        uf,
        count: v.count,
        mediaDias: v.count > 0 ? Math.round((v.somaDias / v.count) * 100) / 100 : 0,
        maxDias: v.maxDias,
      }))
      .sort((a, b) => b.count - a.count);

    // Análise por cliente
    const porCliente: Record<string, { count: number; somaDias: number; maxDias: number; valorFrete: number }> = {};
    for (const r of rows) {
      const nome = r.cliente;
      if (!porCliente[nome]) porCliente[nome] = { count: 0, somaDias: 0, maxDias: 0, valorFrete: 0 };
      porCliente[nome].count++;
      porCliente[nome].valorFrete += r.valorFrete ?? 0;
      if (r.leadTimeDias != null) {
        porCliente[nome].somaDias += r.leadTimeDias;
        if (r.leadTimeDias > porCliente[nome].maxDias) porCliente[nome].maxDias = r.leadTimeDias;
      }
    }
    const analiseCliente = Object.entries(porCliente)
      .map(([cliente, v]) => ({
        cliente,
        count: v.count,
        mediaDias: v.count > 0 ? Math.round((v.somaDias / v.count) * 100) / 100 : 0,
        maxDias: v.maxDias,
        valorFrete: v.valorFrete,
      }))
      .sort((a, b) => b.count - a.count);

    // Peso e frete total
    const pesoTotal = rows.reduce((s, r) => s + (r.pesoTotalKg ?? 0), 0);
    const freteTotal = rows.reduce((s, r) => s + (r.valorFrete ?? 0), 0);

    return NextResponse.json({
      ok: true,
      periodo: { dateFrom: dateFromStr || null, dateTo: dateToStr || null, statusFilter },
      metricas: {
        totalColetas,
        coletasAberto,
        coletasFechado,
        mediaDias: mediaDias != null ? Math.round(mediaDias * 100) / 100 : null,
        maxDias: maxDias != null ? Math.round(maxDias * 100) / 100 : null,
        minDias: minDias != null ? Math.round(minDias * 100) / 100 : null,
        pesoTotal,
        freteTotal,
      },
      faixas,
      analiseUf,
      analiseCliente,
      coletas: rows,
    });
  } catch (e: any) {
    console.error('GET /api/relatorios/patio error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erro interno' }, { status: 500 });
  }
}
