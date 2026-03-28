import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/checkins?motoristaId=xxx&date=2026-03-28
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const motoristaId = searchParams.get('motoristaId') || undefined;
    const dateParam = searchParams.get('date');

    // Default to today if no date specified
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const where: any = {
      data: { gte: startOfDay, lte: endOfDay },
    };
    if (motoristaId) {
      where.motoristaId = motoristaId;
    }

    const checkins = await prisma.checkinMotorista.findMany({
      where,
      include: {
        motorista: { select: { id: true, nome: true } },
      },
      orderBy: { data: 'desc' },
      take: 200,
    });

    return NextResponse.json(checkins);
  } catch (e: any) {
    console.error('GET /api/checkins error:', e);
    return NextResponse.json({ error: 'Falha ao listar checkins' }, { status: 500 });
  }
}

// POST /api/checkins
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const motoristaId = String(body?.motoristaId ?? '').trim();
    const localizacao = String(body?.localizacao ?? '').trim();
    const observacao = body?.observacao ? String(body.observacao).trim() : null;
    const registradoPor = body?.registradoPor ? String(body.registradoPor).trim() : null;

    if (!motoristaId) {
      return NextResponse.json({ error: 'motoristaId e obrigatorio' }, { status: 400 });
    }
    if (!localizacao) {
      return NextResponse.json({ error: 'localizacao e obrigatoria' }, { status: 400 });
    }

    const checkin = await prisma.checkinMotorista.create({
      data: { motoristaId, localizacao, observacao, registradoPor },
      include: {
        motorista: { select: { id: true, nome: true } },
      },
    });

    return NextResponse.json(checkin, { status: 201 });
  } catch (e: any) {
    console.error('POST /api/checkins error:', e);
    return NextResponse.json({ error: 'Falha ao criar checkin' }, { status: 500 });
  }
}
