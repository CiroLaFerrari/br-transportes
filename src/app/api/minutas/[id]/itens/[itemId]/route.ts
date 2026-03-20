import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  params: Promise<{ itemId: string }>;
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  try {
    const { itemId } = await ctx.params;
    const id = String(itemId || '').trim();
    if (!id) return json({ ok: false, error: 'itemId ausente' }, 400);

    await prisma.minutaItem.delete({ where: { id } });

    return json({ ok: true }, 200);
  } catch (e: any) {
    console.error('DELETE /api/minutas/itens/[itemId] error:', e);
    return json({ ok: false, error: e?.message || 'Falha ao excluir item' }, 500);
  }
}
