import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function getMinutaClient() {
  const db: any = prisma as any;

  // seu schema é: model MinutaConferencia -> delegate prisma.minutaConferencia
  const client = db?.minutaConferencia;
  if (!client || typeof client.findMany !== 'function') {
    throw new Error(
      [
        'Prisma Client não possui o model "minutaConferencia".',
        'Causas comuns:',
        '1) Você não rodou: npx prisma generate (ou npx prisma migrate dev) após criar/alterar o model.',
        '2) O schema.prisma está diferente do que você acha.',
        '',
        'Ação:',
        '- Rode: npx prisma generate',
        '- Reinicie o dev server (CTRL+C e npm run dev).',
      ].join('\n'),
    );
  }
  return client as typeof prisma.minutaConferencia;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const take = Math.min(Math.max(Number(url.searchParams.get('take') || 20), 1), 200);
    const search = String(url.searchParams.get('search') || '').trim();

    const minutaDb = getMinutaClient();

    const where: any = search
      ? {
          OR: [
            { nfNumero: { contains: search, mode: 'insensitive' } },
            { cliente: { contains: search, mode: 'insensitive' } },
            { cidade: { contains: search, mode: 'insensitive' } },
            { uf: { contains: search, mode: 'insensitive' } },
            { numero: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const items = await minutaDb.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        numero: true,
        nfNumero: true,
        cliente: true,
        cidade: true,
        uf: true,
        motorista: true,
        pedido: true,
        coletador: true,
        dataColeta: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { itens: true } },
      },
    });

    return json({ ok: true, items });
  } catch (e: any) {
    console.error('GET /api/minutas error:', e);
    return json({ ok: false, error: e?.message || 'Falha ao listar' }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const minutaDb = getMinutaClient();

    const body = await req.json().catch(() => ({} as any));

    const numero = String(body?.numero || '').trim() || null;
    const nfNumero = String(body?.nfNumero || '').trim();
    const cliente = String(body?.cliente || '').trim();
    const cidade = String(body?.cidade || '').trim();
    const uf = String(body?.uf || '').trim().toUpperCase();
    const motorista = String(body?.motorista || '').trim() || null;
    const pedido = String(body?.pedido || '').trim() || null;
    const coletador = String(body?.coletador || '').trim() || null;
    const dataColeta = body?.dataColeta ? new Date(String(body.dataColeta)) : null;

    if (!nfNumero) return json({ ok: false, error: 'Informe NF' }, 400);
    if (!cliente) return json({ ok: false, error: 'Informe Cliente' }, 400);
    if (!cidade) return json({ ok: false, error: 'Informe Cidade' }, 400);
    if (!uf || uf.length !== 2) return json({ ok: false, error: 'UF inválida' }, 400);

    const created = await minutaDb.create({
      data: {
        numero,
        nfNumero,
        cliente,
        cidade,
        uf,
        motorista,
        pedido,
        coletador,
        dataColeta,
      },
      select: { id: true },
    });

    return json({ ok: true, id: created.id }, 201);
  } catch (e: any) {
    console.error('POST /api/minutas error:', e);
    return json({ ok: false, error: e?.message || 'Falha ao criar' }, 500);
  }
}
