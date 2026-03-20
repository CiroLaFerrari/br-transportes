import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/debug/etiquetas
// Lista coletas -> itens -> volumes (etiquetas reais do ItemVolume)
export async function GET() {
  try {
    const coletas = await prisma.coleta.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        Cliente: true,
        itens: {
          include: {
            Produto: true,
            volumes: true, // <- precisa existir no schema (relation ItemColetado -> ItemVolume)
          },
        },
      },
    });

    const resultado = coletas.map((c) => ({
      coletaId: c.id,
      nf: c.nf,
      cliente: c.Cliente?.razao ?? null,
      cidade: c.cidade,
      uf: c.uf,
      createdAt: c.createdAt,
      itens: c.itens.map((it) => ({
        itemId: it.id,
        etiquetaItem: it.etiqueta,
        quantidade: it.quantidade,
        produtoCodigo: it.Produto?.code ?? null,
        produtoDescricao: it.Produto?.descricao ?? null,
        volumes: (it as any).volumes?.map((v: any) => ({
          volumeId: v.id,
          etiquetaVolume: v.etiqueta,
          componenteId: v.componenteId ?? null,
        })) ?? [],
      })),
    }));

    return NextResponse.json({ ok: true, coletas: resultado });
  } catch (err: any) {
    console.error('GET /api/debug/etiquetas error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Erro ao listar etiquetas.' }, { status: 500 });
  }
}
