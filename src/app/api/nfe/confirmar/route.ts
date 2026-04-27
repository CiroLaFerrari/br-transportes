// src/app/api/nfe/confirmar/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { nfe, clienteIdOverride } = await req.json();

    if (!nfe?.nNF) {
      return NextResponse.json({ error: 'Dados da NF-e inválidos.' }, { status: 400 });
    }

    // Garante que a NF ainda não existe
    const jaExiste = await prisma.coleta.findFirst({ where: { nf: String(nfe.nNF) } });
    if (jaExiste) {
      return NextResponse.json(
        { error: `NF-e ${nfe.nNF} já foi importada. Coleta ID: ${jaExiste.id}` },
        { status: 409 }
      );
    }

    // 1. Upsert cliente ──────────────────────────────────────────────────────
    let clienteId: string = clienteIdOverride ?? '';

    if (!clienteId) {
      const cnpjLimpo  = (nfe.emitente.cnpj ?? '').replace(/\D/g, '');
      const cnpjFormat = nfe.emitente.cnpj;

      const cli = await prisma.cliente.upsert({
        where:  { cnpj: cnpjFormat },
        update: {},
        create: {
          razao:    nfe.emitente.razaoSocial,
          cnpj:     cnpjFormat || cnpjLimpo || null,
          cidade:   nfe.emitente.cidade,
          uf:       nfe.emitente.uf,
          endereco: nfe.emitente.endereco ?? null,
        },
      });
      clienteId = cli.id;
    }

    // 2. Criar coleta ────────────────────────────────────────────────────────
    const destCidade = nfe.destinatario?.cidade ?? nfe.emitente.cidade;
    const destUF     = nfe.destinatario?.uf     ?? nfe.emitente.uf;

    const coleta = await prisma.coleta.create({
      data: {
        clienteId,
        nf:          String(nfe.nNF),
        cidade:      destCidade,
        uf:          destUF,
        pesoTotalKg: nfe.pesoTotal ?? null,
        valorFrete:  null,
        status:      'EM_PATIO',
      },
    });

    // 3. Upsert produtos + criar itens ───────────────────────────────────────
    let produtosCriados = 0;
    let itensCriados    = 0;

    for (const item of nfe.itens) {
      let produtoId: string = item.produtoExistente?.id ?? '';

      if (!produtoId) {
        const prod = await prisma.produto.upsert({
          where:  { code: item.cProd },
          update: {},
          create: {
            code:      item.cProd,
            descricao: item.xProd,
            pesoKg:    item.pesoLiq ?? null,
            tipoCodigo: 'FORNECEDOR',
          },
        });
        produtoId = prod.id;
        produtosCriados++;
      }

      await prisma.itemColetado.create({
        data: {
          coletaId:   coleta.id,
          produtoId,
          quantidade: Math.max(1, Math.round(Number(item.qCom) || 1)),
          etiqueta:   `NF-${nfe.nNF}-${String(item.nItem).padStart(3, '0')}`,
        },
      });
      itensCriados++;
    }

    return NextResponse.json({
      success: true,
      coletaId: coleta.id,
      nNF:      nfe.nNF,
      clienteId,
      produtosCriados,
      itensCriados,
    });
  } catch (e: any) {
    console.error('[nfe/confirmar]', e);
    return NextResponse.json({ error: e.message ?? 'Erro ao importar NF-e.' }, { status: 500 });
  }
}
