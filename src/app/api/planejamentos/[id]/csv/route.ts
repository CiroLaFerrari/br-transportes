import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  params: Promise<{ id: string }>; // Next 15
};

function escCsv(v: any) {
  const s = String(v ?? '');
  const safe = s.replace(/"/g, '""').replace(/\r?\n/g, ' ');
  return `"${safe}"`;
}

function extractFretePctFromNotes(notesRaw: string) {
  const key = 'FRETE_CLIENTE_PCT=';
  const lines = String(notesRaw || '').split('\n');
  for (const l of lines) {
    const t = l.trim();
    if (t.toUpperCase().startsWith(key)) return t.slice(key.length).trim();
  }
  return '';
}

function toNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function calcTotaisFromColeta(c: any) {
  let kg = toNumber(c?.pesoTotalKg);
  if (!kg && Array.isArray(c?.itens)) {
    kg = c.itens.reduce((acc: number, it: any) => {
      const q = toNumber(it?.quantidade);
      const p = toNumber(it?.Produto?.pesoKg);
      return acc + q * p;
    }, 0);
  }

  let m3 = 0;
  if (Array.isArray(c?.itens)) {
    m3 = c.itens.reduce((acc: number, it: any) => {
      const q = toNumber(it?.quantidade);
      const v = toNumber(it?.Produto?.volumeM3);
      return acc + q * v;
    }, 0);
  }

  const frete = toNumber(c?.valorFrete);
  return { kg, m3, frete };
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const planejamentoId = String(id || '').trim();
    if (!planejamentoId) {
      return NextResponse.json({ ok: false, error: 'planejamentoId ausente' }, { status: 400 });
    }

    const plan = await prisma.planejamento.findUnique({
      where: { id: planejamentoId },
      select: {
        id: true,
        name: true,
        status: true,
        vehiclePlate: true,
        driverName: true,
        notes: true,
        updatedAt: true,
        paradas: {
          orderBy: { ordem: 'asc' },
          select: {
            ordem: true,
            Coleta: {
              select: {
                id: true,
                nf: true,
                cidade: true,
                uf: true,
                pesoTotalKg: true,
                valorFrete: true,
                Cliente: { select: { razao: true } },
                itens: {
                  select: {
                    quantidade: true,
                    Produto: { select: { pesoKg: true, volumeM3: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!plan) {
      return NextResponse.json({ ok: false, error: 'Planejamento não encontrado' }, { status: 404 });
    }

    const pctRaw = extractFretePctFromNotes(plan.notes || '');
    const pct = Number(String(pctRaw || '0').replace(',', '.'));
    const fretePct = Number.isFinite(pct) ? pct : 0;

    const cols = [
      'planejamentoId',
      'planejamentoNome',
      'status',
      'vehiclePlate',
      'driverName',
      'freteClientePct',
      'ordem',
      'coletaId',
      'nf',
      'cliente',
      'cidade',
      'uf',
      'pesoKg',
      'volumeM3',
      'valorFrete',
      'freteClienteCalc',
    ];

    const lines: string[] = [];
    lines.push(cols.map(escCsv).join(','));

    for (const p of plan.paradas || []) {
      const c = p.Coleta;
      if (!c) continue;

      const { kg, m3, frete } = calcTotaisFromColeta(c);
      const freteCliente = frete * (fretePct / 100);

      const row = [
        plan.id,
        plan.name || '',
        (plan.status as any) || 'DRAFT',
        plan.vehiclePlate || '',
        plan.driverName || '',
        String(fretePct),
        String(p.ordem),
        c.id,
        c.nf,
        c.Cliente?.razao ?? '',
        c.cidade,
        c.uf,
        String(kg),
        String(m3),
        String(frete),
        String(freteCliente),
      ];

      lines.push(row.map(escCsv).join(','));
    }

    const csv = lines.join('\n');
    const fileName = `planejamento-${plan.id}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    console.error('GET /api/planejamentos/[id]/csv error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erro interno' }, { status: 500 });
  }
}