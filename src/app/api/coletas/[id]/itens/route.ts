import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

function novaEtiqueta(): string {
  return crypto.randomBytes(10).toString('hex');
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const coletaId = String(id || '').trim();
    if (!coletaId) {
      return NextResponse.json({ ok: false, error: 'Coleta ID inválido.' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const produtoCodigo = String(body?.produtoCodigo || '').trim();
    const quantidade = Number(body?.quantidade || 0);

    if (!produtoCodigo || !Number.isFinite(quantidade) || quantidade <= 0) {
      return NextResponse.json(
        { ok: false, error: 'Informe produtoCodigo e quantidade > 0.' },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const coleta = await tx.coleta.findUnique({
        where: { id: coletaId },
        select: { id: true },
      });
      if (!coleta) throw new Error('Coleta não encontrada.');

      const produto = await tx.produto.findUnique({
        where: { code: produtoCodigo },
        include: { componentes: true },
      });
      if (!produto) throw new Error(`Produto não encontrado: ${produtoCodigo}`);

      // cria item
      const item = await tx.itemColetado.create({
        data: {
          coletaId,
          produtoId: produto.id,
          quantidade,
          // etiqueta do item (se o seu schema exigir unique, mantenha algo previsível)
          etiqueta: `ITEM-${coletaId.slice(-6)}-${produtoCodigo}-${Date.now()}`,
        },
        select: { id: true, etiqueta: true },
      });

      // cria volumes
      const desmontavel = !!produto.desmontavel && produto.componentes?.length;
      const volumes: Array<{ etiqueta: string; componenteId?: string | null }> = [];

      if (desmontavel) {
        for (let u = 0; u < quantidade; u++) {
          for (const comp of produto.componentes) {
            const qtdComp = (comp as any).quantidade ?? 1;
            for (let k = 0; k < qtdComp; k++) {
              volumes.push({ etiqueta: novaEtiqueta(), componenteId: comp.id });
            }
          }
        }
      } else {
        for (let u = 0; u < quantidade; u++) {
          volumes.push({ etiqueta: novaEtiqueta(), componenteId: null });
        }
      }

      if (volumes.length) {
        await tx.itemVolume.createMany({
          data: volumes.map((v) => ({
            itemColetadoId: item.id,
            etiqueta: v.etiqueta,
            componenteId: v.componenteId ?? null,
          })),
        });
      }

      const createdVolumes = await tx.itemVolume.findMany({
        where: { itemColetadoId: item.id },
        select: { id: true, etiqueta: true, componenteId: true },
        orderBy: { id: 'asc' },
      });

      return { item, createdVolumes };
    });

    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (e: any) {
    console.error('POST /api/coletas/[id]/itens error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erro interno' }, { status: 500 });
  }
}
