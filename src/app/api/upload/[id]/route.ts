import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/upload/[id] - serve the file
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;

    const arquivo = await prisma.arquivo.findUnique({
      where: { id },
      select: { nome: true, mimeType: true, conteudo: true },
    });

    if (!arquivo) {
      return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 });
    }

    const buffer = Buffer.from(arquivo.conteudo, 'base64');

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': arquivo.mimeType,
        'Content-Disposition': `inline; filename="${arquivo.nome}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (e: any) {
    console.error('GET /api/upload/[id] error:', e);
    return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 });
  }
}
