import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function onlyDigits(v: string) {
  return String(v || '').replace(/\D+/g, '');
}

/**
 * GET /api/clientes
 * Query params:
 *  - q?: string (busca por razão social, CNPJ, cidade ou UF)
 *  - limit?: number (1..200) - padrão 20
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();

    const limitNum = Number(searchParams.get('limit') || '20');
    const limit = Number.isFinite(limitNum) ? Math.max(1, Math.min(200, limitNum)) : 20;

    const where = q
      ? {
          OR: [
            { razao: { contains: q, mode: 'insensitive' as const } },
            { cnpj: { contains: q, mode: 'insensitive' as const } },
            { cidade: { contains: q, mode: 'insensitive' as const } },
            { uf: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const list = await prisma.cliente.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        razao: true,
        cnpj: true,
        uf: true,
        cidade: true,
        percentualFrete: true,
        endereco: true,
        localEntrega: true,
        particularidades: true,
        ajudantes: true,
        createdAt: true,
        _count: { select: { coletas: true } },
      },
    });

    return NextResponse.json(list);
  } catch (e: any) {
    console.error('GET /api/clientes error:', e);
    return NextResponse.json({ error: e?.message || 'Erro interno ao listar clientes.' }, { status: 500 });
  }
}

/**
 * POST /api/clientes
 * Body:
 * {
 *   razao: string,
 *   cnpj?: string | null,
 *   uf: string,
 *   cidade: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const razao = String(body?.razao || '').trim();
    const cnpjRaw = body?.cnpj === undefined || body?.cnpj === null ? '' : String(body.cnpj).trim();
    const cnpj = cnpjRaw ? onlyDigits(cnpjRaw) : null; // ✅ opcional
    const uf = String(body?.uf || '').trim().toUpperCase();
    const cidade = String(body?.cidade || '').trim();

    if (!razao || !uf || !cidade) {
      return NextResponse.json({ error: 'Campos obrigatórios: razao, uf, cidade. (cnpj é opcional)' }, { status: 400 });
    }
    if (!/^[A-Z]{2}$/.test(uf)) {
      return NextResponse.json({ error: 'UF inválida (use 2 letras, ex: SP).' }, { status: 400 });
    }

    const percentualFrete = body?.percentualFrete !== undefined ? Number(body.percentualFrete) : undefined;
    const endereco = body?.endereco !== undefined ? (body.endereco ? String(body.endereco).trim().slice(0, 500) : null) : undefined;
    const localEntrega = body?.localEntrega !== undefined ? (body.localEntrega ? String(body.localEntrega).trim().slice(0, 500) : null) : undefined;
    const particularidades = body?.particularidades !== undefined ? (body.particularidades ? String(body.particularidades).trim().slice(0, 1000) : null) : undefined;
    const ajudantes = body?.ajudantes !== undefined ? Boolean(body.ajudantes) : undefined;

    const data: any = { razao, cnpj, uf, cidade };
    if (percentualFrete !== undefined && Number.isFinite(percentualFrete)) data.percentualFrete = percentualFrete;
    if (endereco !== undefined) data.endereco = endereco;
    if (localEntrega !== undefined) data.localEntrega = localEntrega;
    if (particularidades !== undefined) data.particularidades = particularidades;
    if (ajudantes !== undefined) data.ajudantes = ajudantes;

    const created = await prisma.cliente.create({
      data,
      select: { id: true },
    });

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e: any) {
    console.error('POST /api/clientes error:', e);

    if (e?.code === 'P2002') {
      const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(',') : e?.meta?.target || 'campo único';
      return NextResponse.json({ error: `Valor duplicado para campo único: ${target}.` }, { status: 409 });
    }

    return NextResponse.json({ error: e?.message || 'Erro interno ao criar cliente.' }, { status: 500 });
  }
}