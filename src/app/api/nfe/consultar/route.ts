// src/app/api/nfe/consultar/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { consultarNFe } from '@/lib/nfe/provider';
import type { NFeItem } from '@/lib/nfe/types';

/** Tenta encontrar produto existente por código ou palavras da descrição */
async function findProduto(cProd: string, xProd: string) {
  // 1. Código exato
  const byCode = await prisma.produto.findUnique({
    where: { code: cProd },
    select: { id: true, code: true, descricao: true },
  });
  if (byCode) return { produto: byCode, matchType: 'código' as const };

  // 2. Palavras ≥ 3 chars na descrição (60% de acerto)
  const words = xProd
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 3);

  if (words.length >= 2) {
    const all = await prisma.produto.findMany({
      select: { id: true, code: true, descricao: true },
    });
    let best: { produto: (typeof all)[0]; score: number } | null = null;
    for (const p of all) {
      const desc = p.descricao.toUpperCase();
      const hits = words.filter((w) => desc.includes(w)).length;
      const score = hits / words.length;
      if (score >= 0.6 && (!best || score > best.score)) {
        best = { produto: p, score };
      }
    }
    if (best) return { produto: best.produto, matchType: 'descrição' as const };
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { chave } = await req.json();
    const digits = String(chave ?? '').replace(/\D/g, '');

    if (digits.length !== 44) {
      return NextResponse.json(
        { error: 'Chave de acesso deve ter exatamente 44 dígitos.' },
        { status: 400 }
      );
    }

    // Consulta provedor NF-e
    const nfe = await consultarNFe(digits);

    // NF já importada?
    const coletaExistente = await prisma.coleta.findFirst({
      where: { nf: nfe.nNF },
      select: { id: true, nf: true, createdAt: true },
    });

    // Cliente já cadastrado?
    const cnpjLimpo = nfe.emitente.cnpj.replace(/\D/g, '');
    const clienteExistente = await prisma.cliente.findFirst({
      where: {
        OR: [
          { cnpj: nfe.emitente.cnpj },
          { cnpj: cnpjLimpo },
        ],
      },
      select: { id: true, razao: true, cnpj: true },
    });

    // Status de cada item
    const itensComStatus = await Promise.all(
      nfe.itens.map(async (item: NFeItem) => {
        const match = await findProduto(item.cProd, item.xProd);
        return {
          ...item,
          produtoExistente: match
            ? {
                id: match.produto.id,
                code: match.produto.code,
                descricao: match.produto.descricao,
                matchType: match.matchType,
              }
            : null,
        };
      })
    );

    const novosProdutos = itensComStatus.filter((i) => !i.produtoExistente).length;

    return NextResponse.json({
      nfe: { ...nfe, itens: itensComStatus },
      preview: {
        clienteExistente: clienteExistente
          ? { id: clienteExistente.id, razao: clienteExistente.razao }
          : null,
        coletaExistente: coletaExistente
          ? { id: coletaExistente.id, nf: coletaExistente.nf }
          : null,
        novosClientes: clienteExistente ? 0 : 1,
        novosProdutos,
        totalItens: nfe.itens.length,
      },
    });
  } catch (e: any) {
    console.error('[nfe/consultar]', e);
    return NextResponse.json({ error: e.message ?? 'Erro ao consultar NF-e.' }, { status: 500 });
  }
}
