// src/app/api/scan/[etiqueta]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/scan/ETQ-123-01 -> timeline dessa etiqueta (mais recente por último)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ etiqueta: string }> }) {
  try {
    const { etiqueta } = await params;
    const raw = decodeURIComponent(etiqueta || '').trim();
    if (!raw) return NextResponse.json({ ok: false, error: 'Informe uma etiqueta.' }, { status: 400 });

    // ✅ suporta consultar tanto "ETQ-XXX" quanto "XXX" (sem prefixo)
    const variants = new Set<string>();
    variants.add(raw);

    if (raw.toUpperCase().startsWith('ETQ-')) variants.add(raw.substring(4));
    else variants.add(`ETQ-${raw}`);

    const list = Array.from(variants);

    const rows = await prisma.scanEvent.findMany({
      where: { etiqueta: { in: list } },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      ok: true,
      etiqueta: raw,
      variants: list,
      events: rows,
    });
  } catch (e) {
    console.error('GET /api/scan/[etiqueta]', e);
    return NextResponse.json({ ok: false, error: 'Erro ao buscar timeline' }, { status: 500 });
  }
}
