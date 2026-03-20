import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  params: Promise<{ id: string }>; // Next 15
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function n(v: any): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const num = Number(typeof v === 'string' ? v.replace(',', '.') : v);
  return Number.isFinite(num) ? num : null;
}

function sum(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0);
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}
function round4(v: number) {
  return Math.round(v * 10000) / 10000;
}

/**
 * POST /api/planejamentos/[id]/viabilidade
 * Body esperado (mínimo):
 * {
 *   pctCliente?: number,          // % sobre o frete total (ex: 6.5)
 *   pctMotorista?: number,        // % sobre o frete total (ex: 5)
 *   motoristaFixo?: number,       // R$ fixo
 *   metaLucro?: number,           // R$ alvo (opcional)
 *
 *   // custo (igual seu /cost)
 *   diesel_price?: number,
 *   consumption_km_per_litre?: number,
 *   driver_hourly?: number,
 *   tolls?: number[],
 *   extras?: { label: string; value: number }[],
 *
 *   // capacidade (opcional)
 *   veiculoId?: string,
 *   vehiclePlate?: string
 * }
 *
 * Saída:
 * - totals (peso, volume, frete, entregas)
 * - custo operacional (diesel/motorista/pedágio/extras)
 * - pagamento motorista (% + fixo)
 * - receita (% cliente)
 * - lucro e diff da meta
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const planejamentoId = String(id || '').trim();
    if (!planejamentoId) return json({ ok: false, error: 'Parâmetro id é obrigatório.' }, 400);

    const body = (await req.json().catch(() => null)) as any;
    if (!body || typeof body !== 'object') {
      return json({ ok: false, error: 'Body inválido (JSON).' }, 400);
    }

    // ===== inputs viabilidade =====
    const pctCliente = n(body.pctCliente) ?? 6.5; // default “módulo”
    const pctMotorista = n(body.pctMotorista) ?? 0;
    const motoristaFixo = n(body.motoristaFixo) ?? 0;
    const metaLucro = n(body.metaLucro);

    if (!Number.isFinite(pctCliente) || pctCliente < 0) {
      return json({ ok: false, error: 'pctCliente inválido.' }, 400);
    }
    if (!Number.isFinite(pctMotorista) || pctMotorista < 0) {
      return json({ ok: false, error: 'pctMotorista inválido.' }, 400);
    }
    if (!Number.isFinite(motoristaFixo) || motoristaFixo < 0) {
      return json({ ok: false, error: 'motoristaFixo inválido.' }, 400);
    }
    if (metaLucro != null && (!Number.isFinite(metaLucro) || metaLucro < 0)) {
      return json({ ok: false, error: 'metaLucro inválida.' }, 400);
    }

    // ===== inputs custo =====
    const diesel_price = n(body.diesel_price) ?? 0;
    const consumption_km_per_litre = n(body.consumption_km_per_litre) ?? 0;
    const driver_hourly = n(body.driver_hourly); // pode ser null
    const tolls = Array.isArray(body.tolls) ? body.tolls.map(n).filter((x: number | null): x is number => x != null && x >= 0) : [];
    const extras = Array.isArray(body.extras)
      ? body.extras
          .filter((e: any) => e && typeof e === 'object')
          .map((e: any) => ({ label: String(e.label || '').trim(), value: n(e.value) ?? 0 }))
          .filter((e: any) => e.label)
      : [];

    // validação mínima (igual /cost: se não quiser custo agora, pode mandar 0 e ele calcula 0)
    if (!Number.isFinite(diesel_price) || diesel_price < 0) {
      return json({ ok: false, error: 'diesel_price inválido.' }, 400);
    }
    if (!Number.isFinite(consumption_km_per_litre) || consumption_km_per_litre < 0) {
      return json({ ok: false, error: 'consumption_km_per_litre inválido.' }, 400);
    }

    // ===== carrega planejamento + paradas/coletas =====
    const planejamento = await prisma.planejamento.findUnique({
      where: { id: planejamentoId },
      select: {
        id: true,
        name: true,
        payload: true,
        vehiclePlate: true,
        veiculoId: true,
        motoristaId: true,
        createdAt: true,
      } as any,
    });

    if (!planejamento) {
      return json({ ok: false, error: 'Planejamento não encontrado.' }, 404);
    }

    const paradas = await prisma.parada.findMany({
      where: { planejamentoId },
      orderBy: { ordem: 'asc' },
      select: {
        id: true,
        ordem: true,
        kmTrecho: true,
        durMinTrecho: true,
        label: true,
        coletaId: true,
        Coleta: {
          select: {
            id: true,
            nf: true,
            cidade: true,
            uf: true,
            valorFrete: true,
            pesoTotalKg: true,
            entradaPatioAt: true,
            fimPatioAt: true,
            embarqueAt: true,
            prazoEntrega: true,
            urgencia: true,
            Cliente: { select: { razao: true } },
            itens: {
              select: {
                id: true,
                quantidade: true,
                Produto: {
                  select: {
                    id: true,
                    code: true,
                    descricao: true,
                    volumeM3: true,
                    pesoKg: true,
                    desmontavel: true,
                  },
                },
                volumes: {
                  select: {
                    id: true,
                    componenteId: true,
                    componente: { select: { id: true, nome: true, volumeM3: true, pesoKg: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    // ===== distância / duração (prioriza paradas.kmTrecho / durMinTrecho; fallback payload) =====
    const kmTrechos = paradas.map((p: any) => (typeof p.kmTrecho === 'number' ? p.kmTrecho : null)).filter((x: any) => x != null);
    const durTrechos = paradas.map((p: any) => (typeof p.durMinTrecho === 'number' ? p.durMinTrecho : null)).filter((x: any) => x != null);

    const payload: any = planejamento.payload || {};
    const payloadKm = n(payload?.total_km) ?? 0;
    const payloadDur = n(payload?.total_dur_min) ?? 0;

    const distance_km = kmTrechos.length > 0 ? sum(kmTrechos) : payloadKm;
    const duration_min = durTrechos.length > 0 ? sum(durTrechos) : payloadDur;

    // ===== totais coletas =====
    const coletas = paradas
      .map((p: any) => p.Coleta)
      .filter(Boolean);

    const totalEntregas = coletas.length;

    const freteTotal = round2(
      sum(
        coletas
          .map((c: any) => (typeof c.valorFrete === 'number' ? c.valorFrete : 0))
          .filter((x: any) => Number.isFinite(x)),
      ),
    );

    const pesoTotalKg = round2(
      sum(
        coletas
          .map((c: any) => (typeof c.pesoTotalKg === 'number' ? c.pesoTotalKg : 0))
          .filter((x: any) => Number.isFinite(x)),
      ),
    );

    // ===== volume (M3) a partir dos ItemVolume
    // regra:
    // - se itemVolume.componenteId == null => usa Produto.volumeM3 (1 volume representa uma unidade física)
    // - se itemVolume.componenteId != null => usa componente.volumeM3
    let volumeTotalM3 = 0;

    for (const c of coletas) {
      const itens = Array.isArray(c.itens) ? c.itens : [];
      for (const it of itens) {
        const vols = Array.isArray(it.volumes) ? it.volumes : [];

        // se não existir volumes, faz fallback simples: Produto.volumeM3 * quantidade
        if (!vols.length) {
          const v = it?.Produto?.volumeM3;
          if (typeof v === 'number' && Number.isFinite(v)) {
            volumeTotalM3 += v * (Number(it.quantidade || 0) || 0);
          }
          continue;
        }

        for (const v of vols) {
          if (v?.componenteId) {
            const vv = v?.componente?.volumeM3;
            if (typeof vv === 'number' && Number.isFinite(vv)) volumeTotalM3 += vv;
          } else {
            const pv = it?.Produto?.volumeM3;
            if (typeof pv === 'number' && Number.isFinite(pv)) volumeTotalM3 += pv;
          }
        }
      }
    }

    volumeTotalM3 = round4(volumeTotalM3);

    // ===== tempo de pátio (Lead Time) por coleta
    const tempoPatioItems: { coletaId: string; nf: string; dias: number | null }[] = [];
    for (const c of coletas) {
      const entrada = c.entradaPatioAt ? new Date(c.entradaPatioAt) : null;
      const saida = c.fimPatioAt ? new Date(c.fimPatioAt) : (c.embarqueAt ? new Date(c.embarqueAt) : null);
      let dias: number | null = null;
      if (entrada && saida) {
        dias = round2((saida.getTime() - entrada.getTime()) / (1000 * 60 * 60 * 24));
      } else if (entrada) {
        dias = round2((Date.now() - entrada.getTime()) / (1000 * 60 * 60 * 24));
      }
      tempoPatioItems.push({ coletaId: c.id, nf: c.nf, dias });
    }
    const tempoPatioMedioDias = (() => {
      const vals = tempoPatioItems.map((t) => t.dias).filter((d): d is number => d != null);
      return vals.length > 0 ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    })();

    // ===== atraso de entrega e urgência
    const now = new Date();
    const atrasoItems: { coletaId: string; nf: string; diasAtraso: number | null; urgencia: string }[] = [];
    let temUrgente = false;
    let temAlta = false;
    let maxAtraso = 0;

    for (const c of coletas) {
      const prazo = c.prazoEntrega ? new Date(c.prazoEntrega) : null;
      let diasAtraso: number | null = null;
      if (prazo) {
        diasAtraso = round2((now.getTime() - prazo.getTime()) / (1000 * 60 * 60 * 24));
        if (diasAtraso > maxAtraso) maxAtraso = diasAtraso;
      }
      const urg = String(c.urgencia || 'NORMAL');
      if (urg === 'URGENTE') temUrgente = true;
      if (urg === 'ALTA') temAlta = true;
      atrasoItems.push({ coletaId: c.id, nf: c.nf, diasAtraso, urgencia: urg });
    }

    // ===== capacidade do veículo (opcional)
    const veiculoId = String(body?.veiculoId || planejamento.veiculoId || '').trim() || null;
    const vehiclePlate = String(body?.vehiclePlate || planejamento.vehiclePlate || '').trim().toUpperCase() || null;

    let veiculo: any = null;
    if (veiculoId) {
      veiculo = await prisma.veiculo.findUnique({
        where: { id: veiculoId },
        select: { id: true, placa: true, capacidadeKg: true, capacidadeM3: true },
      });
    } else if (vehiclePlate) {
      veiculo = await prisma.veiculo.findFirst({
        where: { placa: vehiclePlate },
        select: { id: true, placa: true, capacidadeKg: true, capacidadeM3: true },
      });
    }

    const capKg = veiculo?.capacidadeKg ?? null;
    const capM3 = veiculo?.capacidadeM3 ?? null;

    const okKg = capKg != null ? pesoTotalKg <= capKg : null;
    const okM3 = capM3 != null ? volumeTotalM3 <= capM3 : null;

    // ===== disponibilidade do motorista
    const motoristaId = String(body?.motoristaId || planejamento.motoristaId || '').trim() || null;
    let motoristaInfo: { id: string; nome: string; disponivel: boolean } | null = null;
    if (motoristaId) {
      const mot = await prisma.motorista.findUnique({
        where: { id: motoristaId },
        select: { id: true, nome: true, disponibilidade: true },
      });
      if (mot) {
        motoristaInfo = { id: mot.id, nome: mot.nome, disponivel: mot.disponibilidade };
      }
    }

    // ===== custo operacional (igual /cost)
    const fuel_liters =
      consumption_km_per_litre > 0 ? distance_km / consumption_km_per_litre : 0;

    const fuel_cost = fuel_liters * diesel_price;

    const driver_hours = duration_min / 60;
    const driver_cost = (driver_hourly != null && driver_hourly > 0) ? driver_hours * driver_hourly : 0;

    const tolls_total = sum(tolls);
    const extras_total = sum(extras.map((e: any) => Number(e.value || 0)));

    const custoOperacional = fuel_cost + driver_cost + tolls_total + extras_total;

    // ===== regras de receita/pagamento
    const receita = freteTotal * (pctCliente / 100);
    const pagamentoMotorista = (freteTotal * (pctMotorista / 100)) + motoristaFixo;

    const lucro = receita - (custoOperacional + pagamentoMotorista);

    const diffMeta = metaLucro != null ? (lucro - metaLucro) : null;

    return json({
      ok: true,
      planejamentoId,
      planejamento: { id: planejamento.id, name: planejamento.name, createdAt: planejamento.createdAt },
      inputs: {
        pctCliente,
        pctMotorista,
        motoristaFixo,
        metaLucro: metaLucro ?? null,
        diesel_price,
        consumption_km_per_litre,
        driver_hourly: driver_hourly ?? null,
        tolls,
        extras,
        veiculoId,
        vehiclePlate,
      },
      totals: {
        totalEntregas,
        freteTotal: round2(freteTotal),
        pesoTotalKg: round2(pesoTotalKg),
        volumeTotalM3: round4(volumeTotalM3),
        distance_km: round2(distance_km),
        duration_min: round2(duration_min),
      },
      vehicle: veiculo
        ? {
            id: veiculo.id,
            placa: veiculo.placa,
            capacidadeKg: veiculo.capacidadeKg,
            capacidadeM3: veiculo.capacidadeM3,
            okKg,
            okM3,
          }
        : null,
      motorista: motoristaInfo,
      tempoPatio: {
        mediaDias: tempoPatioMedioDias,
        porColeta: tempoPatioItems,
      },
      atraso: {
        maxDiasAtraso: round2(maxAtraso),
        temUrgente,
        temAlta,
        porColeta: atrasoItems,
      },
      breakdown: {
        fuel_liters: round2(fuel_liters),
        fuel_cost: round2(fuel_cost),
        driver_hours: round2(driver_hours),
        driver_cost: round2(driver_cost),
        tolls_total: round2(tolls_total),
        extras_total: round2(extras_total),
        custoOperacional: round2(custoOperacional),
      },
      finance: {
        receita: round2(receita),
        pagamentoMotorista: round2(pagamentoMotorista),
        lucro: round2(lucro),
        diffMeta: diffMeta == null ? null : round2(diffMeta),
      },
    });
  } catch (e: any) {
    console.error('POST /api/planejamentos/[id]/viabilidade error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno.' }, 500);
  }
}