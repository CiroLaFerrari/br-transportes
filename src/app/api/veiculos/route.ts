import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/veiculos?limit=100
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const takeRaw = Number(searchParams.get('limit') || '100');
    const take = Number.isFinite(takeRaw) ? Math.min(Math.max(takeRaw, 1), 500) : 100;

    const list = await prisma.veiculo.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        placa: true,
        capacidadeKg: true,
        capacidadeM3: true,
        compCm: true,
        largCm: true,
        altCm: true,
        createdAt: true,
      },
    });

    return NextResponse.json(list);
  } catch (e: any) {
    console.error('GET /api/veiculos error:', e);
    return NextResponse.json({ error: e?.message || 'Falha ao listar veículos' }, { status: 500 });
  }
}

// POST /api/veiculos
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    const placa = String(body?.placa ?? '').trim().toUpperCase();
    const capacidadeKg = Number(body?.capacidadeKg);
    const capacidadeM3 = Number(body?.capacidadeM3);
    const compCm = Number(body?.compCm);
    const largCm = Number(body?.largCm);
    const altCm = Number(body?.altCm);

    if (!placa) return NextResponse.json({ error: 'Placa é obrigatória' }, { status: 400 });

    if (!Number.isInteger(capacidadeKg)) {
      return NextResponse.json({ error: 'capacidadeKg (Int) é obrigatória' }, { status: 400 });
    }
    if (!Number.isFinite(capacidadeM3)) {
      return NextResponse.json({ error: 'capacidadeM3 (Float) é obrigatória' }, { status: 400 });
    }
    if (!Number.isInteger(compCm) || !Number.isInteger(largCm) || !Number.isInteger(altCm)) {
      return NextResponse.json({ error: 'compCm, largCm e altCm (Int) são obrigatórios' }, { status: 400 });
    }

    const created = await prisma.veiculo.create({
      data: { placa, capacidadeKg, capacidadeM3, compCm, largCm, altCm },
      select: { id: true },
    });

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e: any) {
    console.error('POST /api/veiculos error:', e);
    if (String(e?.code) === 'P2002') {
      return NextResponse.json({ error: 'Placa já cadastrada' }, { status: 409 });
    }
    return NextResponse.json({ error: e?.message || 'Falha ao criar veículo' }, { status: 500 });
  }
}