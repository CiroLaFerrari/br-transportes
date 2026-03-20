import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  params: Promise<{ id: string }>; // Next 15
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function getMinutaClient() {
  const db: any = prisma as any;
  const client = db?.minutaConferencia;
  if (!client || typeof client.findUnique !== 'function') {
    throw new Error(
      [
        'Prisma Client não possui o model "minutaConferencia".',
        'Rode: npx prisma generate',
        'Reinicie o dev server.',
      ].join('\n'),
    );
  }
  return client as typeof prisma.minutaConferencia;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const minutaId = String(id || '').trim();
    if (!minutaId) return json({ ok: false, error: 'minutaId ausente.' }, 400);

    const minutaDb = getMinutaClient();

    const minuta = await minutaDb.findUnique({
      where: { id: minutaId },
      include: {
        itens: {
          orderBy: { createdAt: 'asc' },
          include: { volumes: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });

    if (!minuta) return json({ ok: false, error: 'Minuta não encontrada' }, 404);
    return json({ ok: true, minuta });
  } catch (e: any) {
    console.error('GET /api/minutas/[id] error:', e);
    return json({ ok: false, error: e?.message || 'Falha ao abrir' }, 500);
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const minutaId = String(id || '').trim();
    if (!minutaId) return json({ ok: false, error: 'minutaId ausente.' }, 400);

    const minutaDb = getMinutaClient();
    const body = await req.json().catch(() => ({} as any));

    const numero = String(body?.numero || '').trim() || null;
    const nfNumero = String(body?.nfNumero || '').trim();
    const cliente = String(body?.cliente || '').trim();
    const cidade = String(body?.cidade || '').trim();
    const uf = String(body?.uf || '').trim().toUpperCase();
    const motorista = String(body?.motorista || '').trim() || null;
    const pedido = String(body?.pedido || '').trim() || null;
    const coletador = String(body?.coletador || '').trim() || null;
    const dataColeta = body?.dataColeta ? new Date(String(body.dataColeta)) : null;

    if (!nfNumero) return json({ ok: false, error: 'Informe NF' }, 400);
    if (!cliente) return json({ ok: false, error: 'Informe Cliente' }, 400);
    if (!cidade) return json({ ok: false, error: 'Informe Cidade' }, 400);
    if (!uf || uf.length !== 2) return json({ ok: false, error: 'UF inválida' }, 400);

    await minutaDb.update({
      where: { id: minutaId },
      data: { numero, nfNumero, cliente, cidade, uf, motorista, pedido, coletador, dataColeta },
    });

    return json({ ok: true }, 200);
  } catch (e: any) {
    console.error('PATCH /api/minutas/[id] error:', e);
    return json({ ok: false, error: e?.message || 'Falha ao atualizar' }, 500);
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const minutaId = String(id || '').trim();
    if (!minutaId) return json({ ok: false, error: 'minutaId ausente.' }, 400);

    const minutaDb = getMinutaClient();
    await minutaDb.delete({ where: { id: minutaId } });

    return json({ ok: true }, 200);
  } catch (e: any) {
    console.error('DELETE /api/minutas/[id] error:', e);
    return json({ ok: false, error: e?.message || 'Falha ao excluir' }, 500);
  }
}
