import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function onlyDigits(v: string) {
  return String(v || '').replace(/\D+/g, '');
}

// PATCH /api/clientes/:id
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const body = await req.json().catch(() => ({}));
    const data: any = {};

    if (body?.razao !== undefined) {
      const r = String(body.razao || '').trim();
      if (!r) return NextResponse.json({ error: 'razao não pode ser vazia.' }, { status: 400 });
      data.razao = r;
    }

    if (body?.cnpj !== undefined) {
      data.cnpj = body.cnpj ? onlyDigits(String(body.cnpj)) : null;
    }

    if (body?.uf !== undefined) {
      const uf = String(body.uf || '').trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(uf)) return NextResponse.json({ error: 'UF inválida.' }, { status: 400 });
      data.uf = uf;
    }

    if (body?.cidade !== undefined) {
      const c = String(body.cidade || '').trim();
      if (!c) return NextResponse.json({ error: 'cidade não pode ser vazia.' }, { status: 400 });
      data.cidade = c;
    }

    if (body?.percentualFrete !== undefined) {
      data.percentualFrete = body.percentualFrete === null ? null : Number(body.percentualFrete);
      if (data.percentualFrete !== null && !Number.isFinite(data.percentualFrete)) {
        return NextResponse.json({ error: 'percentualFrete inválido.' }, { status: 400 });
      }
    }
    if (body?.endereco !== undefined) data.endereco = body.endereco ? String(body.endereco).trim().slice(0, 500) : null;
    if (body?.localEntrega !== undefined) data.localEntrega = body.localEntrega ? String(body.localEntrega).trim().slice(0, 500) : null;
    if (body?.particularidades !== undefined) data.particularidades = body.particularidades ? String(body.particularidades).trim().slice(0, 1000) : null;
    if (body?.ajudantes !== undefined) data.ajudantes = Boolean(body.ajudantes);

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo válido informado para atualização.' }, { status: 400 });
    }

    const updated = await prisma.cliente.update({
      where: { id },
      data,
      select: { id: true, razao: true, cnpj: true, uf: true, cidade: true, percentualFrete: true, endereco: true, localEntrega: true, particularidades: true, ajudantes: true, updatedAt: true },
    });

    return NextResponse.json({ ok: true, updated });
  } catch (e: any) {
    console.error('PATCH /api/clientes/[id] error:', e);
    if (e?.code === 'P2002') return NextResponse.json({ error: 'CNPJ já cadastrado.' }, { status: 409 });
    return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 });
  }
}

// DELETE /api/clientes/:id
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await prisma.cliente.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('DELETE /api/clientes/[id] error:', e);
    return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 });
  }
}