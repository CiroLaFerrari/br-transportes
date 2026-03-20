// src/app/api/planejamentos/[id]/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Body esperado: { status: "PLANNED" | "IN_TRANSIT" | "DONE" | "CANCELED" | "DRAFT" }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const status = String(body?.status || '').toUpperCase();

    const allowed = new Set(['DRAFT', 'PLANNED', 'IN_TRANSIT', 'DONE', 'CANCELED']);
    if (!allowed.has(status)) {
      return NextResponse.json({ error: 'status inválido' }, { status: 400 });
    }

    const updated = await prisma.planejamento.update({
      where: { id },
      data: { status: status as any },
      select: {
        id: true,
        name: true,
        status: true,
        vehiclePlate: true,
        driverName: true,
        planStartAt: true,
        planEndAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (e: any) {
    // se não achar, o prisma lança; padronizo 404
    if (e?.code === 'P2025') {
      return NextResponse.json({ error: 'Planejamento não encontrado.' }, { status: 404 });
    }
    console.error('POST /planejamentos/[id]/status error:', e);
    return NextResponse.json({ error: e?.message || 'Erro ao atualizar status' }, { status: 500 });
  }
}
