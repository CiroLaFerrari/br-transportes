import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  params: Promise<{ id: string }>; // Next 15
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function upsertLinha(notesRaw: string, key: string, value: string) {
  const KEY = String(key || '').trim();
  const lines = String(notesRaw || '').split('\n');
  const cleaned = lines.filter((l) => !l.trim().toUpperCase().startsWith(KEY.toUpperCase() + '='));
  if (value !== undefined && value !== null && String(value).trim() !== '') {
    cleaned.unshift(`${KEY}=${String(value).trim()}`);
  }
  return cleaned.join('\n').trim();
}

/** Gera etiqueta sequencial para MinutaVolume */
function gerarEtiqueta(minutaNumero: string, itemIdx: number, volIdx: number): string {
  const item = String(itemIdx + 1).padStart(3, '0');
  const vol = String(volIdx + 1).padStart(3, '0');
  return `${minutaNumero}-${item}-${vol}`;
}

export async function POST(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const planejamentoId = String(id || '').trim();
    if (!planejamentoId) return json({ ok: false, error: 'planejamentoId ausente' }, 400);

    const plan = await prisma.planejamento.findUnique({
      where: { id: planejamentoId },
      select: { id: true, status: true, notes: true, updatedAt: true, driverName: true, motoristaId: true, Motorista: { select: { nome: true } } },
    });

    if (!plan) return json({ ok: false, error: 'Planejamento não encontrado' }, 404);

    // Se já estiver fechado, é idempotente
    const alreadyClosed = plan.status && plan.status !== 'DRAFT';
    if (alreadyClosed) {
      return json({
        ok: true,
        closed: true,
        status: plan.status,
        message: 'Planejamento já estava fechado (status != DRAFT).',
      });
    }

    const nowIso = new Date().toISOString();
    const notesMerged = upsertLinha(plan.notes || '', 'FECHADO_AT', nowIso);

    const updated = await prisma.planejamento.update({
      where: { id: planejamentoId },
      data: {
        status: 'PLANNED',
        notes: notesMerged,
      } as any,
      select: { id: true, status: true, notes: true, updatedAt: true },
    });

    // =============================================
    // AUTO-GERAÇÃO DE MINUTAS para cada coleta
    // =============================================
    const minutasCriadas: Array<{ minutaId: string; coletaId: string; nf: string }> = [];
    const motoristaNome = plan.Motorista?.nome || plan.driverName || null;

    try {
      // Buscar paradas com coletas e itens
      const paradas = await prisma.parada.findMany({
        where: { planejamentoId },
        orderBy: { ordem: 'asc' },
        select: {
          id: true,
          coletaId: true,
          Coleta: {
            select: {
              id: true,
              nf: true,
              cidade: true,
              uf: true,
              valorFrete: true,
              pesoTotalKg: true,
              minutaId: true,
              coletador: true,
              pedido: true,
              clienteId: true,
              Cliente: { select: { razao: true } },
              itens: {
                select: {
                  id: true,
                  produtoId: true,
                  quantidade: true,
                  Produto: {
                    select: {
                      code: true,
                      descricao: true,
                      pesoKg: true,
                      alturaCm: true,
                      larguraCm: true,
                      comprimentoCm: true,
                      areaM2: true,
                      volumeM3: true,
                      desmontavel: true,
                    },
                  },
                  volumes: {
                    select: {
                      id: true,
                      etiqueta: true,
                      componenteId: true,
                      componente: { select: { nome: true, codigo: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Agrupar coletas únicas (uma parada pode ter a mesma coleta)
      const coletasMap = new Map<string, typeof paradas[0]['Coleta']>();
      for (const p of paradas) {
        if (p.Coleta && !coletasMap.has(p.coletaId)) {
          coletasMap.set(p.coletaId, p.Coleta);
        }
      }

      for (const [coletaId, coleta] of coletasMap) {
        // Pular se já tem minuta vinculada
        if (coleta.minutaId) continue;

        // Gerar número da minuta: M + timestamp curto
        const minutaNumero = `M${Date.now().toString(36).toUpperCase()}`;

        // Criar MinutaConferencia
        const minuta = await prisma.minutaConferencia.create({
          data: {
            numero: minutaNumero,
            nfNumero: coleta.nf,
            cliente: coleta.Cliente?.razao || 'N/A',
            cidade: coleta.cidade,
            uf: coleta.uf,
            motorista: motoristaNome,
            pedido: coleta.pedido,
            coletador: coleta.coletador,
            valorNF: coleta.valorFrete,
            pesoTotalKg: coleta.pesoTotalKg,
          },
        });

        // Criar MinutaItems + MinutaVolumes para cada ItemColetado
        for (let itemIdx = 0; itemIdx < coleta.itens.length; itemIdx++) {
          const item = coleta.itens[itemIdx];
          const prod = item.Produto;

          const minutaItem = await prisma.minutaItem.create({
            data: {
              minutaId: minuta.id,
              produtoId: item.produtoId,
              produtoCode: prod?.code || 'N/A',
              produtoDescricao: prod?.descricao || 'Sem descrição',
              quantidade: item.quantidade,
              pesoKg: prod?.pesoKg ? prod.pesoKg * item.quantidade : null,
              alturaCm: prod?.alturaCm,
              larguraCm: prod?.larguraCm,
              comprimentoCm: prod?.comprimentoCm,
              areaM2: prod?.areaM2,
              volumeM3: prod?.volumeM3 ? prod.volumeM3 * item.quantidade : null,
              desmontavel: prod?.desmontavel ?? false,
            },
          });

          // Se o item tem volumes (etiquetas já existentes), criar MinutaVolumes correspondentes
          if (item.volumes && item.volumes.length > 0) {
            for (let volIdx = 0; volIdx < item.volumes.length; volIdx++) {
              const vol = item.volumes[volIdx];
              await prisma.minutaVolume.create({
                data: {
                  minutaItemId: minutaItem.id,
                  etiqueta: vol.etiqueta,
                  tipo: vol.componente?.nome || 'Volume',
                  codigo: prod?.code || 'N/A',
                  descricao: vol.componente?.nome
                    ? `${prod?.descricao || ''} - ${vol.componente.nome}`
                    : prod?.descricao || 'Volume',
                  pesoKg: prod?.pesoKg ? prod.pesoKg / item.volumes.length : null,
                  alturaCm: prod?.alturaCm,
                  larguraCm: prod?.larguraCm,
                  comprimentoCm: prod?.comprimentoCm,
                  areaM2: prod?.areaM2,
                  volumeM3: prod?.volumeM3 ? prod.volumeM3 / item.volumes.length : null,
                },
              });
            }
          } else {
            // Sem volumes existentes → gerar 1 volume por quantidade
            for (let q = 0; q < item.quantidade; q++) {
              const etiqueta = gerarEtiqueta(minutaNumero, itemIdx, q);
              await prisma.minutaVolume.create({
                data: {
                  minutaItemId: minutaItem.id,
                  etiqueta,
                  tipo: 'Volume',
                  codigo: prod?.code || 'N/A',
                  descricao: prod?.descricao || 'Volume',
                  pesoKg: prod?.pesoKg,
                  alturaCm: prod?.alturaCm,
                  larguraCm: prod?.larguraCm,
                  comprimentoCm: prod?.comprimentoCm,
                  areaM2: prod?.areaM2,
                  volumeM3: prod?.volumeM3,
                },
              });
            }
          }
        }

        // Vincular minuta à coleta
        await prisma.coleta.update({
          where: { id: coletaId },
          data: { minutaId: minuta.id },
        });

        minutasCriadas.push({ minutaId: minuta.id, coletaId, nf: coleta.nf });
      }
    } catch (minutaErr: any) {
      console.error('[fechar] Erro ao gerar minutas (non-fatal):', minutaErr?.message);
    }

    return json({
      ok: true,
      closed: true,
      status: updated.status,
      updatedAt: updated.updatedAt,
      minutas: minutasCriadas,
      message: minutasCriadas.length > 0
        ? `Carga fechada. ${minutasCriadas.length} minuta(s) gerada(s) automaticamente.`
        : 'Carga fechada.',
    });
  } catch (e: any) {
    console.error('POST /api/planejamentos/[id]/fechar error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno' }, 500);
  }
}
