import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/planejamentos/gerar-operacao
 * Body:
 * {
 *   name: string
 *   payload: {
 *     coletas: Array<{ clienteId, nf, cidade, uf, valorFrete?, itens:[{produtoCodigo, quantidade}] }>
 *     ...qualquer outra coisa
 *   }
 *   resetOrdem?: boolean
 *   resetStatusParadas?: boolean
 * }
 *
 * Fluxo:
 * 1) cria planejamento (e coletas/volumes se o seu /api/planejamentos já faz isso)
 * 2) vincula paradas
 * 3) gera rota
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'JSON inválido.' }, { status: 400 });
    }

    const name = String((body as any).name || '').trim();
    const payload = (body as any).payload;

    const resetOrdem = (body as any).resetOrdem !== undefined ? Boolean((body as any).resetOrdem) : true;
    const resetStatusParadas =
      (body as any).resetStatusParadas !== undefined ? Boolean((body as any).resetStatusParadas) : true;

    if (!name) {
      return NextResponse.json({ ok: false, error: 'Informe name.' }, { status: 400 });
    }
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ ok: false, error: 'Informe payload.' }, { status: 400 });
    }

    // Reaproveita as mesmas regras do seu POST /api/planejamentos:
    // Aqui a forma mais segura é chamar diretamente as mesmas funções.
    // Como elas estão dentro do arquivo route.ts atual, deixamos esse endpoint
    // fazer tudo via transação e usando Prisma direto.

    const coletas = Array.isArray((payload as any).coletas) ? (payload as any).coletas : [];
    if (!coletas.length) {
      return NextResponse.json(
        { ok: false, error: 'payload.coletas vazio. Para gerar operação em 1 clique, envie pelo menos 1 coleta.' },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1) cria planejamento
      const planejamento = await tx.planejamento.create({
        data: { name, payload },
        select: { id: true, name: true },
      });

      // 2) garante que já existem coletas criadas (se você já cria coletas no /api/planejamentos, ótimo.
      // Aqui vamos criar "de verdade" caso o payload esteja vindo do front.)
      // OBS: assumindo que seu schema tem Coleta(itens -> ItemColetado) e ItemVolume como você já testou.

      // cria coletas + itens + volumes (mínimo necessário)
      for (const c of coletas) {
        const clienteId = String(c?.clienteId || '').trim();
        const nf = String(c?.nf || '').trim();
        const cidade = String(c?.cidade || '').trim();
        const uf = String(c?.uf || '').trim().toUpperCase();
        const valorFrete = c?.valorFrete === undefined || c?.valorFrete === null ? null : Number(c.valorFrete);

        const itens = Array.isArray(c?.itens) ? c.itens : [];
        if (!clienteId || !nf || !cidade || !uf || !itens.length) {
          throw new Error(`Coleta inválida no payload (clienteId/nf/cidade/uf/itens). NF=${nf || '(vazio)'}`);
        }

        const coleta = await tx.coleta.create({
          data: {
            clienteId,
            nf,
            cidade,
            uf,
            valorFrete,
            status: 'EM_PATIO',
            entradaPatioAt: new Date(),
          },
          select: { id: true },
        });

        // busca produtos por codigo (Produto.code -> mapeado pra coluna codigo)
        const codigos = itens.map((i: any) => String(i?.produtoCodigo || '').trim()).filter(Boolean);
        const produtos = await tx.produto.findMany({
          where: { code: { in: codigos } },
          include: { componentes: true },
        });
        const mapProduto = new Map(produtos.map((p) => [p.code, p]));

        for (const it of itens) {
          const produtoCodigo = String(it?.produtoCodigo || '').trim();
          const quantidade = Number(it?.quantidade || 0);
          if (!produtoCodigo || quantidade <= 0) continue;

          const produto = mapProduto.get(produtoCodigo);
          if (!produto) throw new Error(`Produto não encontrado: ${produtoCodigo}`);

          // item coletado
          const item = await tx.itemColetado.create({
            data: {
              coletaId: coleta.id,
              produtoId: produto.id,
              quantidade,
              // etiquetaItem opcional (se seu schema tiver)
              // etiqueta: ...
            },
            select: { id: true },
          });

          // volumes (1 por unidade se não desmontável; senão por componente * quantidade)
          const desmontavel = !!produto.desmontavel && (produto.componentes?.length || 0) > 0;
          const volumes: { itemColetadoId: string; etiqueta: string; componenteId: string | null }[] = [];

          const novaEtiqueta = () => cryptoRandomHex(10);

          if (desmontavel) {
            for (let u = 0; u < quantidade; u++) {
              for (const comp of produto.componentes) {
                const qtdComp = (comp as any).quantidade ?? 1;
                for (let k = 0; k < qtdComp; k++) {
                  volumes.push({ itemColetadoId: item.id, etiqueta: novaEtiqueta(), componenteId: comp.id });
                }
              }
            }
          } else {
            for (let u = 0; u < quantidade; u++) {
              volumes.push({ itemColetadoId: item.id, etiqueta: novaEtiqueta(), componenteId: null });
            }
          }

          if (volumes.length) {
            await tx.itemVolume.createMany({ data: volumes });
          }
        }
      }

      // 3) vincula paradas para as coletas criadas (últimas N coletas dessa operação)
      // Como acabamos de inserir, pegamos as N coletas mais recentes do cliente(s) com NF do payload.
      const nfs = coletas.map((c: any) => String(c?.nf || '').trim()).filter(Boolean);

      const coletasCriadas = await tx.coleta.findMany({
        where: { nf: { in: nfs } },
        select: { id: true, nf: true },
        orderBy: { createdAt: 'desc' },
      });

      const coletaIds = coletasCriadas.map((c) => c.id);

      // cria/atualiza paradas: se você já tem endpoint pronto, isso aqui deve seguir a mesma regra
      // (vamos criar paradas simples, ordem crescente)
      if (resetOrdem) {
        await tx.parada.deleteMany({ where: { planejamentoId: planejamento.id } });
      }

      let ordem = 1;
      for (const coletaId of coletaIds) {
        await tx.parada.create({
          data: {
            planejamentoId: planejamento.id,
            coletaId,
            ordem,
            label: `Destino - ${nfs.includes('') ? '' : ''}`,
            lat: -23.5505,
            lon: -46.6333,
            statusExec: 'PENDENTE',
          },
        });
        ordem++;
      }

      // 4) gera rota
      const rota = await tx.rota.create({
        data: {
          status: 'PLANEJADA',
          dataRota: new Date(),
        },
        select: { id: true, status: true, dataRota: true },
      });

      // vincula paradas à rota e reseta status se pedido
      const paradas = await tx.parada.findMany({
        where: { planejamentoId: planejamento.id },
        orderBy: { ordem: 'asc' },
        select: { id: true },
      });

      for (const p of paradas) {
        await tx.parada.update({
          where: { id: p.id },
          data: {
            rotaId: rota.id,
            ...(resetStatusParadas
              ? { statusExec: 'PENDENTE', checkinAt: null, checkoutAt: null }
              : {}),
          },
        });
      }

      return { planejamento, rota, totalParadas: paradas.length, coletaIds };
    });

    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (e: any) {
    console.error('POST /api/planejamentos/gerar-operacao error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erro interno' }, { status: 500 });
  }
}

// helper sem crypto import (evita treta em edge)
function cryptoRandomHex(bytes: number) {
  // Node runtime: Next Route Handler default em node
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('crypto');
  return crypto.randomBytes(bytes).toString('hex');
}
