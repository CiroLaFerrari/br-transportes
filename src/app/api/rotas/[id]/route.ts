import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function diffDias(a: Date, b: Date) {
  const ms = a.getTime() - b.getTime();
  return ms / 86400000; // 24*60*60*1000
}

function calcLeadPatioDias(coleta: {
  status: string;
  entradaPatioAt: Date | null;
  embarqueAt: Date | null;
  fimPatioAt: Date | null;
}) {
  const inicio = coleta.entradaPatioAt;
  if (!inicio) {
    return {
      leadPatioDias: null as number | null,
      patioFimAt: null as Date | null,
      patioAberto: false,
    };
  }

  const fim = coleta.fimPatioAt ?? coleta.embarqueAt ?? null;

  // se ainda está EM_PATIO e não tem fim, usa "agora" para ter lead time vivo
  if (!fim && coleta.status === 'EM_PATIO') {
    const now = new Date();
    return {
      leadPatioDias: diffDias(now, inicio),
      patioFimAt: null,
      patioAberto: true,
    };
  }

  if (!fim) {
    return {
      leadPatioDias: null as number | null,
      patioFimAt: null as Date | null,
      patioAberto: false,
    };
  }

  return {
    leadPatioDias: diffDias(fim, inicio),
    patioFimAt: fim,
    patioAberto: false,
  };
}

// GET /api/rotas/:id
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params; // Next 15: params precisa ser awaited
    const rotaId = String(id || '').trim();

    if (!rotaId) {
      return NextResponse.json({ ok: false, error: 'id inválido' }, { status: 400 });
    }

    const rota = await prisma.rota.findUnique({
      where: { id: rotaId },
      include: {
        paradas: {
          orderBy: { ordem: 'asc' },
          include: {
            Coleta: {
              select: {
                id: true,
                nf: true,
                cidade: true,
                uf: true,
                status: true,
                entradaPatioAt: true,
                embarqueAt: true,
                fimPatioAt: true,
                Cliente: { select: { id: true, razao: true } },
              },
            },
          },
        },
      },
    });

    if (!rota) {
      return NextResponse.json({ ok: false, error: 'Rota não encontrada' }, { status: 404 });
    }

    const entregues = rota.paradas.filter((p) => p.statusExec === 'ENTREGUE').length;

    const out = {
      id: rota.id,
      dataRota: rota.dataRota,
      status: rota.status,
      kmTotal: (rota as any).kmTotal ?? null,
      freteTotal: (rota as any).freteTotal ?? null,
      freteMotorista: (rota as any).freteMotorista ?? null,
      motoristaId: (rota as any).motoristaId ?? null,
      veiculoId: (rota as any).veiculoId ?? null,
      createdAt: (rota as any).createdAt,
      updatedAt: (rota as any).updatedAt,

      paradas: rota.paradas.map((p) => {
        const c = p.Coleta;

        const lead = c
          ? calcLeadPatioDias({
              status: c.status,
              entradaPatioAt: c.entradaPatioAt ?? null,
              embarqueAt: c.embarqueAt ?? null,
              fimPatioAt: c.fimPatioAt ?? null,
            })
          : { leadPatioDias: null as number | null, patioFimAt: null as Date | null, patioAberto: false };

        return {
          id: p.id,
          ordem: p.ordem,
          label: p.label,
          lat: p.lat,
          lon: p.lon,
          statusExec: p.statusExec,
          checkinAt: p.checkinAt,
          checkoutAt: p.checkoutAt,
          kmTrecho: (p as any).kmTrecho ?? null,
          durMinTrecho: (p as any).durMinTrecho ?? null,
          obsStatus: (p as any).obsStatus ?? null,
          // POD
          recebedorNome: (p as any).recebedorNome ?? null,
          recebedorDoc: (p as any).recebedorDoc ?? null,
          obsEntrega: (p as any).obsEntrega ?? null,
          coletaId: p.coletaId,
          planejamentoId: (p as any).planejamentoId ?? null,
          rotaId: p.rotaId ?? null,

          Coleta: c
            ? {
                id: c.id,
                nf: c.nf,
                cidade: c.cidade,
                uf: c.uf,
                status: c.status,
                entradaPatioAt: c.entradaPatioAt,
                embarqueAt: c.embarqueAt,
                fimPatioAt: c.fimPatioAt,

                // lead time pátio
                leadPatioDias: lead.leadPatioDias,
                patioAberto: lead.patioAberto,
                patioFimAt: lead.patioFimAt,

                Cliente: c.Cliente ? { id: c.Cliente.id, razao: c.Cliente.razao } : null,
              }
            : null,
        };
      }),

      totalParadas: rota.paradas.length,
      entregues,
    };

    return NextResponse.json({ ok: true, rota: out });
  } catch (e: any) {
    console.error('GET /api/rotas/[id] error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erro interno' }, { status: 500 });
  }
}