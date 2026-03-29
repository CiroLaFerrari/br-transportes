// src/app/api/coletas/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/coletas
 * Query params:
 *  - nf?: string
 *  - cidade?: string
 *  - q?: string (fallback genérico)
 *  - status?: string (EM_PATIO | CARREGADA | EM_TRANSITO | ENTREGUE)
 *  - limit?: number (1..200) - padrão 50
 *  - page?: number (>=1) - padrão 1
 *  - withMeta?: "1" -> retorna { data, page, limit, total }
 *  - orderBy?: "createdAt" | "entradaPatioAt" | "nf" | "cidade"  (opcional)
 *  - orderDir?: "asc" | "desc" (opcional)
 *
 * Por compatibilidade:
 * - Se withMeta=1: retorna objeto com meta
 * - Senão: retorna array direto
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const nf = (searchParams.get('nf') || '').trim();
    const cidade = (searchParams.get('cidade') || '').trim();
    const q = (searchParams.get('q') || '').trim();
    const status = (searchParams.get('status') || '').trim().toUpperCase();
    const withMeta = (searchParams.get('withMeta') || '').trim() === '1';

    const limitNum = Number(searchParams.get('limit') || '50');
    const limit = Number.isFinite(limitNum) ? Math.max(1, Math.min(200, limitNum)) : 50;

    const pageNum = Number(searchParams.get('page') || '1');
    const page = Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1;

    // ✅ ordenação (novo)
    const orderByRaw = String(searchParams.get('orderBy') || 'createdAt').trim();
    const orderDirRaw = String(searchParams.get('orderDir') || 'desc').trim().toLowerCase();
    const orderDir: 'asc' | 'desc' = orderDirRaw === 'asc' ? 'asc' : 'desc';

    const orderByAllowed = new Set(['createdAt', 'entradaPatioAt', 'nf', 'cidade']);
    const orderBy = orderByAllowed.has(orderByRaw) ? orderByRaw : 'createdAt';

    const where: any = {};

    // filtro por status
    if (status) {
      const allowed = ['EM_PATIO', 'CARREGADA', 'EM_TRANSITO', 'ENTREGUE'];
      if (allowed.includes(status)) where.status = status;
    }

    if (nf) where.nf = { contains: nf, mode: 'insensitive' };
    if (cidade) where.cidade = { contains: cidade, mode: 'insensitive' };

    if (q) {
      where.OR = [
        { nf: { contains: q, mode: 'insensitive' } },
        { cidade: { contains: q, mode: 'insensitive' } },
        { uf: { contains: q, mode: 'insensitive' } },
        {
          Cliente: {
            is: { razao: { contains: q, mode: 'insensitive' } },
          },
        },
      ];
    }

    const skip = (page - 1) * limit;

    const total = await prisma.coleta.count({ where });

    const data = await prisma.coleta.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [orderBy]: orderDir } as any,
      select: {
        id: true,
        nf: true,
        cidade: true,
        uf: true,
        valorFrete: true,
        pesoTotalKg: true,
        clienteId: true,
        status: true,
        entradaPatioAt: true,
        embarqueAt: true,
        fimPatioAt: true,
        prazoEntrega: true,
        urgencia: true,
        minutaId: true,
        coletador: true,
        pedido: true,
        createdAt: true as any,
        Cliente: { select: { id: true, razao: true } },
      },
    });

    const headers = new Headers();
    headers.set('X-Total-Count', String(total));

    if (withMeta) {
      return NextResponse.json({ data, page, limit, total }, { headers });
    }

    return NextResponse.json(data, { headers });
  } catch (e: any) {
    console.error('GET /api/coletas error:', e);
    return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 });
  }
}

/**
 * POST /api/coletas
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const nf = String(body?.nf || '').trim();
    const cidade = String(body?.cidade || '').trim();
    const uf = String(body?.uf || '').trim().toUpperCase();
    const clienteId = String(body?.clienteId || '').trim();

    const valorFreteNum = Number(typeof body?.valorFrete === 'string' ? body.valorFrete.replace(',', '.') : body?.valorFrete);
    const pesoTotalKgNum = Number(typeof body?.pesoTotalKg === 'string' ? body.pesoTotalKg.replace(',', '.') : body?.pesoTotalKg);

    if (!nf || !cidade || !uf || !clienteId) {
      return NextResponse.json({ error: 'Campos obrigatórios: nf, cidade, uf, clienteId.' }, { status: 400 });
    }

    if (!/^[A-Z]{2}$/.test(uf)) {
      return NextResponse.json({ error: 'UF inválida (use 2 letras).' }, { status: 400 });
    }

    if (!Number.isFinite(valorFreteNum)) {
      return NextResponse.json({ error: 'valorFrete inválido.' }, { status: 400 });
    }

    if (!Number.isFinite(pesoTotalKgNum)) {
      return NextResponse.json({ error: 'pesoTotalKg inválido.' }, { status: 400 });
    }

    const cli = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true } });
    if (!cli) {
      return NextResponse.json({ error: 'clienteId inexistente.' }, { status: 400 });
    }

    const prazoEntrega = body?.prazoEntrega ? new Date(String(body.prazoEntrega)) : undefined;
    const urgenciaRaw = String(body?.urgencia || '').trim().toUpperCase();
    const urgencia = ['NORMAL', 'ALTA', 'URGENTE'].includes(urgenciaRaw) ? urgenciaRaw : undefined;
    const minutaId = body?.minutaId ? String(body.minutaId).trim() : undefined;
    const coletador = body?.coletador ? String(body.coletador).trim() : undefined;
    const pedido = body?.pedido ? String(body.pedido).trim() : undefined;

    const created = await prisma.coleta.create({
      data: {
        nf, cidade, uf, valorFrete: valorFreteNum, pesoTotalKg: pesoTotalKgNum, clienteId,
        ...(prazoEntrega && !isNaN(prazoEntrega.getTime()) ? { prazoEntrega } : {}),
        ...(urgencia ? { urgencia: urgencia as any } : {}),
        ...(minutaId ? { minutaId } : {}),
        ...(coletador ? { coletador } : {}),
        ...(pedido ? { pedido } : {}),
      },
      select: { id: true, nf: true, cidade: true, uf: true, valorFrete: true, pesoTotalKg: true, clienteId: true, status: true as any },
    });

    // Create ItemColetado records if items provided
    const itens = Array.isArray(body?.itens) ? body.itens : [];
    if (itens.length > 0) {
      const itemsData = itens
        .filter((i: any) => i?.produtoId && Number.isInteger(Number(i?.quantidade)) && Number(i?.quantidade) > 0)
        .map((i: any) => ({
          coletaId: created.id,
          produtoId: String(i.produtoId),
          quantidade: Number(i.quantidade),
        }));
      if (itemsData.length > 0) {
        await prisma.itemColetado.createMany({ data: itemsData });
      }
    }

    return NextResponse.json({ ok: true, created }, { status: 201 });
  } catch (e: any) {
    console.error('POST /api/coletas error:', e);
    return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 });
  }
}

/**
 * PUT /api/coletas?id=...
 */
export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = (searchParams.get('id') || '').trim();
    if (!id) return NextResponse.json({ error: 'Parâmetro id é obrigatório na query.' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const dataToUpdate: any = {};

    if (body?.nf !== undefined) {
      const v = String(body.nf || '').trim();
      if (!v) return NextResponse.json({ error: 'nf não pode ser vazio.' }, { status: 400 });
      dataToUpdate.nf = v;
    }

    if (body?.cidade !== undefined) {
      const v = String(body.cidade || '').trim();
      if (!v) return NextResponse.json({ error: 'cidade não pode ser vazia.' }, { status: 400 });
      dataToUpdate.cidade = v;
    }

    if (body?.uf !== undefined) {
      const v = String(body.uf || '').trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(v)) return NextResponse.json({ error: 'UF inválida (use 2 letras).' }, { status: 400 });
      dataToUpdate.uf = v;
    }

    if (body?.valorFrete !== undefined) {
      const v = Number(typeof body.valorFrete === 'string' ? body.valorFrete.replace(',', '.') : body.valorFrete);
      if (!Number.isFinite(v)) return NextResponse.json({ error: 'valorFrete inválido.' }, { status: 400 });
      dataToUpdate.valorFrete = v;
    }

    if (body?.pesoTotalKg !== undefined) {
      const v = Number(typeof body.pesoTotalKg === 'string' ? body.pesoTotalKg.replace(',', '.') : body.pesoTotalKg);
      if (!Number.isFinite(v)) return NextResponse.json({ error: 'pesoTotalKg inválido.' }, { status: 400 });
      dataToUpdate.pesoTotalKg = v;
    }

    if (body?.clienteId !== undefined) {
      const v = String(body.clienteId || '').trim();
      if (!v) return NextResponse.json({ error: 'clienteId não pode ser vazio.' }, { status: 400 });

      const cli = await prisma.cliente.findUnique({ where: { id: v }, select: { id: true } });
      if (!cli) return NextResponse.json({ error: 'clienteId inexistente.' }, { status: 400 });

      dataToUpdate.clienteId = v;
    }

    if (body?.prazoEntrega !== undefined) {
      if (body.prazoEntrega) {
        const d = new Date(String(body.prazoEntrega));
        if (!isNaN(d.getTime())) dataToUpdate.prazoEntrega = d;
      } else {
        dataToUpdate.prazoEntrega = null;
      }
    }

    if (body?.urgencia !== undefined) {
      const u = String(body.urgencia || '').trim().toUpperCase();
      if (['NORMAL', 'ALTA', 'URGENTE'].includes(u)) {
        dataToUpdate.urgencia = u;
      }
    }

    if (body?.minutaId !== undefined) {
      dataToUpdate.minutaId = body.minutaId ? String(body.minutaId).trim() : null;
    }

    if (body?.coletador !== undefined) {
      dataToUpdate.coletador = body.coletador ? String(body.coletador).trim() : null;
    }

    if (body?.pedido !== undefined) {
      dataToUpdate.pedido = body.pedido ? String(body.pedido).trim() : null;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo válido informado para atualização.' }, { status: 400 });
    }

    const updated = await prisma.coleta.update({
      where: { id },
      data: dataToUpdate,
      select: { id: true, nf: true, cidade: true, uf: true, valorFrete: true, pesoTotalKg: true, clienteId: true, prazoEntrega: true, urgencia: true, minutaId: true, coletador: true, pedido: true },
    });

    return NextResponse.json({ ok: true, updated });
  } catch (e: any) {
    console.error('PUT /api/coletas error:', e);
    return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 });
  }
}

/**
 * DELETE /api/coletas?id=...
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = (searchParams.get('id') || '').trim();
    if (!id) return NextResponse.json({ error: 'Parâmetro id é obrigatório na query.' }, { status: 400 });

    await prisma.coleta.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('DELETE /api/coletas error:', e);
    return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 });
  }
}