import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';

// POST /api/planejamentos/:id/paradas/reordenar
// Body: { ordem: string[] }  // array de parada.id na ordem desejada (1..n)
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params; // id do Planejamento
    const body = await req.json().catch(() => ({}));
    const ordem: string[] = Array.isArray(body?.ordem) ? body.ordem : [];

    if (!id) {
      return NextResponse.json({ error: 'Planejamento id ausente' }, { status: 400 });
    }
    if (!ordem.length) {
      return NextResponse.json({ error: 'Envie body.ordem = [paradaId, ...]' }, { status: 400 });
    }

    // Confere se todas as paradas pertencem ao Planejamento
    const paradas = await prisma.parada.findMany({
      where: { planejamentoId: id },
      select: { id: true },
    });
    const idsDoPlano = new Set(paradas.map(p => p.id));
    for (const pid of ordem) {
      if (!idsDoPlano.has(pid)) {
        return NextResponse.json({ error: `Parada ${pid} não pertence a este Planejamento` }, { status: 400 });
      }
    }

    // Atualiza ordem (1..n) na sequência do array
    for (let i = 0; i < ordem.length; i++) {
      await prisma.parada.update({
        where: { id: ordem[i] },
        data: { ordem: i + 1 },
      });
    }

    return NextResponse.json({ ok: true, planejamentoId: id, reordered: ordem.length });
  } catch (e: any) {
    return NextResponse.json({ error: 'Falha ao reordenar', detail: e?.message || String(e) }, { status: 500 });
  }
}
