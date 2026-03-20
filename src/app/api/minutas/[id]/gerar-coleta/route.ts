import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = { params: Promise<{ id: string }> };

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * POST /api/minutas/[id]/gerar-coleta
 *
 * Gera uma Coleta a partir de uma MinutaConferencia, vinculando os dados.
 * Body opcional:
 * {
 *   clienteId: string,        // obrigatório (ou busca por nome)
 *   valorFrete?: number,
 *   prazoEntrega?: string,    // ISO date
 *   urgencia?: string,        // NORMAL | ALTA | URGENTE
 * }
 *
 * Fluxo:
 * 1. Lê a minuta com itens e volumes
 * 2. Cria Coleta vinculada (minutaId)
 * 3. Para cada MinutaItem, cria ItemColetado com produtoId
 * 4. Para cada MinutaVolume, cria ItemVolume com etiqueta
 * 5. Retorna a coleta criada
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const minutaId = String(id || '').trim();
    if (!minutaId) return json({ ok: false, error: 'minutaId ausente.' }, 400);

    const body = await req.json().catch(() => null);
    if (!body) return json({ ok: false, error: 'JSON inválido.' }, 400);

    const clienteId = String(body?.clienteId || '').trim();
    if (!clienteId) return json({ ok: false, error: 'clienteId é obrigatório.' }, 400);

    // Validate cliente exists
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, razao: true, cidade: true, uf: true },
    });
    if (!cliente) return json({ ok: false, error: 'Cliente não encontrado.' }, 404);

    // Load minuta with items and volumes
    const minuta = await prisma.minutaConferencia.findUnique({
      where: { id: minutaId },
      include: {
        itens: {
          include: { volumes: true },
        },
      },
    });

    if (!minuta) return json({ ok: false, error: 'Minuta não encontrada.' }, 404);

    // Check if coleta already exists for this minuta
    const existing = await prisma.coleta.findFirst({
      where: { minutaId },
      select: { id: true },
    });
    if (existing) {
      return json({ ok: false, error: 'Já existe uma coleta vinculada a esta minuta.', coletaId: existing.id }, 409);
    }

    // Calculate total weight from volumes
    let pesoTotal = 0;
    for (const item of minuta.itens) {
      for (const vol of item.volumes) {
        pesoTotal += vol.pesoKg ?? 0;
      }
      // Fallback: item-level weight
      if (item.volumes.length === 0 && item.pesoKg) {
        pesoTotal += item.pesoKg * (item.quantidade || 1);
      }
    }

    const valorFrete = body?.valorFrete != null ? Number(body.valorFrete) : 0;
    const prazoEntrega = body?.prazoEntrega ? new Date(String(body.prazoEntrega)) : null;
    const urgenciaRaw = String(body?.urgencia || 'NORMAL').trim().toUpperCase();
    const urgencia = ['NORMAL', 'ALTA', 'URGENTE'].includes(urgenciaRaw) ? urgenciaRaw : 'NORMAL';

    // Create coleta + items + volumes in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const coleta = await tx.coleta.create({
        data: {
          nf: minuta.nfNumero,
          cidade: minuta.cidade,
          uf: minuta.uf,
          clienteId: cliente.id,
          valorFrete: Number.isFinite(valorFrete) ? valorFrete : 0,
          pesoTotalKg: pesoTotal,
          minutaId,
          ...(prazoEntrega && !isNaN(prazoEntrega.getTime()) ? { prazoEntrega } : {}),
          urgencia: urgencia as any,
        },
      });

      // Create items and volumes
      for (const mItem of minuta.itens) {
        // Try to find the product by code
        let produtoId = mItem.produtoId;
        if (!produtoId) {
          const prod = await tx.produto.findFirst({
            where: { code: mItem.produtoCode },
            select: { id: true },
          });
          if (prod) produtoId = prod.id;
        }

        if (!produtoId) continue; // Skip items without a valid product

        const itemColetado = await tx.itemColetado.create({
          data: {
            coletaId: coleta.id,
            produtoId,
            quantidade: mItem.quantidade,
            etiqueta: mItem.volumes[0]?.etiqueta ?? null,
          },
        });

        // Create volumes
        for (const mVol of mItem.volumes) {
          // Find componente if exists
          let componenteId: string | null = null;
          if (produtoId && mVol.codigo) {
            const comp = await tx.componente.findFirst({
              where: { produtoId, codigo: mVol.codigo },
              select: { id: true },
            });
            if (comp) componenteId = comp.id;
          }

          await tx.itemVolume.create({
            data: {
              itemColetadoId: itemColetado.id,
              etiqueta: mVol.etiqueta,
              componenteId,
            },
          });
        }
      }

      return coleta;
    });

    return json({
      ok: true,
      coletaId: result.id,
      minutaId,
      message: `Coleta criada com ${minuta.itens.length} item(s) a partir da minuta.`,
    }, 201);
  } catch (e: any) {
    console.error('POST /api/minutas/[id]/gerar-coleta error:', e);
    if (e?.code === 'P2002') {
      return json({ ok: false, error: 'Etiqueta duplicada — uma das etiquetas já existe no sistema.' }, 409);
    }
    return json({ ok: false, error: e?.message || 'Erro interno.' }, 500);
  }
}
