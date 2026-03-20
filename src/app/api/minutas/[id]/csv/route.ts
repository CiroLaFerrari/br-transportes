import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const minutaId = String(id || '').trim();
  if (!minutaId) return NextResponse.json({ ok: false, error: 'id ausente.' }, { status: 400 });

  const minuta = await prisma.minutaConferencia.findUnique({
    where: { id: minutaId },
    select: {
      id: true,
      numero: true,
      nfNumero: true,
      cliente: true,
      cidade: true,
      uf: true,
      itens: {
        select: {
          id: true,
          produtoCode: true,
          produtoDescricao: true,
          quantidade: true,
          desmontavel: true,
          observacao: true,
          volumes: {
            select: {
              id: true,
              etiqueta: true,
              tipo: true,
              codigo: true,
              descricao: true,
              pesoKg: true,
              alturaCm: true,
              larguraCm: true,
              comprimentoCm: true,
              areaM2: true,
              volumeM3: true,
            },
          },
        },
      },
    },
  });

  if (!minuta) return NextResponse.json({ ok: false, error: 'Minuta não encontrada.' }, { status: 404 });

  const rows: string[] = [];
  rows.push(
    [
      'minutaId',
      'minutaNumero',
      'nf',
      'cliente',
      'cidade',
      'uf',
      'itemId',
      'produtoCode',
      'produtoDescricao',
      'quantidade',
      'desmontavel',
      'observacao',
      'volumeId',
      'etiqueta',
      'tipo',
      'codigo',
      'descricao',
      'pesoKg',
      'alturaCm',
      'larguraCm',
      'comprimentoCm',
      'areaM2',
      'volumeM3',
    ].join(','),
  );

  for (const it of minuta.itens || []) {
    const vols = it.volumes || [];
    if (vols.length === 0) {
      rows.push(
        [
          minuta.id,
          minuta.numero ?? '',
          minuta.nfNumero,
          minuta.cliente,
          minuta.cidade,
          minuta.uf,
          it.id,
          it.produtoCode,
          it.produtoDescricao,
          String(it.quantidade),
          it.desmontavel ? 'true' : 'false',
          it.observacao ?? '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
        ]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(','),
      );
      continue;
    }

    for (const v of vols) {
      rows.push(
        [
          minuta.id,
          minuta.numero ?? '',
          minuta.nfNumero,
          minuta.cliente,
          minuta.cidade,
          minuta.uf,
          it.id,
          it.produtoCode,
          it.produtoDescricao,
          String(it.quantidade),
          it.desmontavel ? 'true' : 'false',
          it.observacao ?? '',
          v.id,
          v.etiqueta,
          v.tipo,
          v.codigo,
          v.descricao,
          v.pesoKg ?? '',
          v.alturaCm ?? '',
          v.larguraCm ?? '',
          v.comprimentoCm ?? '',
          v.areaM2 ?? '',
          v.volumeM3 ?? '',
        ]
          .map((x) => `"${String(x).replaceAll('"', '""')}"`)
          .join(','),
      );
    }
  }

  const csv = rows.join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="minuta-${minuta.nfNumero || minutaId}.csv"`,
    },
  });
}
