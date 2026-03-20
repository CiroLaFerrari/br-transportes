// src/app/api/patio/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function diffMs(a?: Date | null, b?: Date | null) {
  if (!a || !b) return null;
  return a.getTime() - b.getTime();
}

function msToHours(ms: number) {
  return Math.round((ms / (1000 * 60 * 60)) * 100) / 100;
}

function msToDays(ms: number) {
  return Math.round((ms / (1000 * 60 * 60 * 24)) * 100) / 100;
}

/**
 * GET /api/patio
 * Query params:
 *  - q?: string (nf, cidade, uf, cliente)
 *  - limit?: number (1..200) default 50
 *  - page?: number (>=1) default 1
 *  - status?: string (default EM_PATIO) -> aceita EM_PATIO | CARREGADA | EM_TRANSITO | ENTREGUE
 *
 * Retorna:
 * { ok, data, page, limit, total }
 * Cada item inclui leadTimePatio (parcial/final).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const q = (searchParams.get('q') || '').trim();
    const statusRaw = (searchParams.get('status') || 'EM_PATIO').trim().toUpperCase();

    const limitNum = Number(searchParams.get('limit') || '50');
    const limit = Number.isFinite(limitNum) ? Math.max(1, Math.min(200, limitNum)) : 50;

    const pageNum = Number(searchParams.get('page') || '1');
    const page = Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1;

    const skip = (page - 1) * limit;

    const allowed = ['EM_PATIO', 'CARREGADA', 'EM_TRANSITO', 'ENTREGUE'];
    const status = allowed.includes(statusRaw) ? statusRaw : 'EM_PATIO';

    const where: any = { status };

    if (q) {
      where.OR = [
        { nf: { contains: q, mode: 'insensitive' } },
        { cidade: { contains: q, mode: 'insensitive' } },
        { uf: { contains: q, mode: 'insensitive' } },
        {
          Cliente: {
            is: { razao: { contains: q, mode: 'insensitive' } },
          },
        },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.coleta.count({ where }),
      prisma.coleta.findMany({
        where,
        skip,
        take: limit,
        orderBy: { entradaPatioAt: 'asc' as any },
        select: {
          id: true,
          nf: true,
          cidade: true,
          uf: true,
          status: true,
          entradaPatioAt: true,
          embarqueAt: true,
          fimPatioAt: true,
          valorFrete: true,
          pesoTotalKg: true,
          clienteId: true,
          createdAt: true as any,
          Cliente: { select: { id: true, razao: true, cidade: true, uf: true } },
        },
      }),
    ]);

    const now = new Date();

    const data = rows.map((c) => {
      const entrada = c.entradaPatioAt ?? null;
      const fim = (c.fimPatioAt ?? c.embarqueAt) ?? null;

      const msAteAgora = entrada ? diffMs(now, entrada) : null;
      const msFinal = entrada && fim ? diffMs(fim, entrada) : null;

      return {
        ...c,
        leadTimePatio: {
          inicio: entrada,
          fim,
          msAteAgora,
          horasAteAgora: msAteAgora != null ? msToHours(msAteAgora) : null,
          diasAteAgora: msAteAgora != null ? msToDays(msAteAgora) : null,
          msFinal,
          horasFinal: msFinal != null ? msToHours(msFinal) : null,
          diasFinal: msFinal != null ? msToDays(msFinal) : null,
          aberto: !fim && c.status === 'EM_PATIO',
        },
      };
    });

    return json({ ok: true, data, page, limit, total });
  } catch (e: any) {
    console.error('GET /api/patio error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno' }, 500);
  }
}