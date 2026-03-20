import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/etiquetas?q=&status=&limit=100
 *
 * Lista etiquetas (ItemVolume) com dados da coleta, produto e cliente.
 * Filtros: q (busca por etiqueta, NF, cliente), status (EM_PATIO, etc.)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const statusFilter = (searchParams.get('status') || '').toUpperCase();
    const limitNum = Math.min(Math.max(Number(searchParams.get('limit') || '100'), 1), 500);

    const where: any = {};

    if (statusFilter && statusFilter !== 'ALL') {
      where.status = statusFilter;
    }

    if (q) {
      where.OR = [
        { etiqueta: { contains: q, mode: 'insensitive' as const } },
        { itemColetado: { Coleta: { nf: { contains: q, mode: 'insensitive' as const } } } },
        { itemColetado: { Coleta: { Cliente: { razao: { contains: q, mode: 'insensitive' as const } } } } },
        { itemColetado: { Coleta: { cidade: { contains: q, mode: 'insensitive' as const } } } },
        { itemColetado: { Produto: { code: { contains: q, mode: 'insensitive' as const } } } },
      ];
    }

    const volumes = await prisma.itemVolume.findMany({
      where,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: {
        itemColetado: {
          include: {
            Produto: { select: { code: true, descricao: true, pesoKg: true } },
            Coleta: {
              select: {
                id: true,
                nf: true,
                cidade: true,
                uf: true,
                status: true,
                pesoTotalKg: true,
                Cliente: { select: { razao: true } },
              },
            },
          },
        },
      },
    });

    const rows = volumes.map((v) => {
      const item = v.itemColetado;
      const coleta = item?.Coleta;
      const produto = item?.Produto;

      return {
        id: v.id,
        etiqueta: v.etiqueta,
        status: v.status,
        scannedAt: v.scannedAt,
        createdAt: v.createdAt,
        coletaId: coleta?.id || null,
        nf: coleta?.nf || '—',
        cidade: coleta?.cidade || '—',
        uf: coleta?.uf || '—',
        coletaStatus: coleta?.status || null,
        cliente: coleta?.Cliente?.razao || '—',
        produtoCodigo: produto?.code || '—',
        produtoDescricao: produto?.descricao || '—',
        pesoKg: produto?.pesoKg ?? null,
        quantidade: item?.quantidade ?? 1,
      };
    });

    // Contagens por status
    const counts = {
      total: rows.length,
      emPatio: rows.filter((r) => r.status === 'EM_PATIO').length,
      carregada: rows.filter((r) => r.status === 'CARREGADA').length,
      emTransito: rows.filter((r) => r.status === 'EM_TRANSITO').length,
      entregue: rows.filter((r) => r.status === 'ENTREGUE').length,
    };

    return NextResponse.json({ ok: true, counts, data: rows });
  } catch (e: any) {
    console.error('GET /api/etiquetas error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erro interno' }, { status: 500 });
  }
}
