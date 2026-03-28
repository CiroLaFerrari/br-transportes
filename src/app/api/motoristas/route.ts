import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/motoristas?limit=100
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const take = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);

    const list = await prisma.motorista.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        nome: true,
        documento: true,
        disponibilidade: true,
        cnhUrl: true,
        cnhVencimento: true,
        createdAt: true,
      },
    });

    return NextResponse.json(list);
  } catch (e: any) {
    console.error('GET /api/motoristas error:', e);
    return NextResponse.json({ error: 'Falha ao listar motoristas' }, { status: 500 });
  }
}

// POST /api/motoristas
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const nome = String(body?.nome ?? '').trim();
    const documento = body?.documento ? String(body.documento).trim() : null;
    const disponibilidade =
      body?.disponibilidade === undefined ? true : Boolean(body.disponibilidade);
    const cnhUrl = body?.cnhUrl ? String(body.cnhUrl).trim() : null;
    const cnhVencimento = body?.cnhVencimento ? new Date(body.cnhVencimento) : null;

    if (!nome) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    }

    const created = await prisma.motorista.create({
      data: { nome, documento, disponibilidade, cnhUrl, cnhVencimento },
      select: { id: true },
    });

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e: any) {
    console.error('POST /api/motoristas error:', e);
    return NextResponse.json({ error: 'Falha ao criar motorista' }, { status: 500 });
  }
}
