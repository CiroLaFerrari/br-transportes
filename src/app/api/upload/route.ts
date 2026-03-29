import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/upload - accepts FormData with a "file" field
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Campo "file" é obrigatório.' }, { status: 400 });
    }

    // Max 4MB
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: 'Arquivo muito grande (máx 4MB).' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');

    const arquivo = await prisma.arquivo.create({
      data: {
        nome: file.name,
        mimeType: file.type || 'application/octet-stream',
        tamanho: file.size,
        conteudo: base64,
      },
      select: { id: true, nome: true },
    });

    return NextResponse.json({
      ok: true,
      id: arquivo.id,
      nome: arquivo.nome,
      url: `/api/upload/${arquivo.id}`,
    }, { status: 201 });
  } catch (e: any) {
    console.error('POST /api/upload error:', e);
    return NextResponse.json({ error: e?.message || 'Falha ao fazer upload' }, { status: 500 });
  }
}
