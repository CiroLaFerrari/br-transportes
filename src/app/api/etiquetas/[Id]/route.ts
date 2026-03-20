import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  // Next 15: params é uma Promise — pasta é [Id] com I maiúsculo
  params: Promise<{ Id: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const { Id: id } = await context.params;
  const rawId = decodeURIComponent(id ?? '').trim();
  const agora = new Date().toISOString();

  async function buildFromAnyColeta() {
    const coleta = await prisma.coleta.findFirst({
      include: { Cliente: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!coleta) {
      return {
        ok: true,
        etiqueta: {
          id: rawId || 'ETQ-FAKE',
          codigoEtiqueta: rawId || 'ETQ-FAKE',
          nf: '123456',
          cliente: 'Cliente Exemplo LTDA',
          cidade: 'São Carlos',
          uf: 'SP',
          itemCodigo: 'SEM_CODIGO',
          itemDescricao: 'Etiqueta genérica (sem coleta real no banco)',
          volume: 1,
          totalVolumes: 1,
          pesoKg: 25.5,
          coletaId: 'COLETA-001',
          dataColeta: agora,
        },
        debug: { mode: 'full-fake', rawId },
      };
    }

    const clienteNome = coleta.Cliente?.razao ?? 'Cliente não informado';
    const cidade = coleta.cidade || coleta.Cliente?.cidade || 'Cidade';
    const uf = coleta.uf || coleta.Cliente?.uf || 'UF';

    return {
      ok: true,
      etiqueta: {
        id: rawId || coleta.id,
        codigoEtiqueta: rawId || coleta.id,
        nf: coleta.nf,
        cliente: clienteNome,
        cidade,
        uf,
        itemCodigo: 'SEM_CODIGO',
        itemDescricao: 'Etiqueta genérica vinculada a uma coleta existente',
        volume: 1,
        totalVolumes: 1,
        pesoKg: coleta.pesoTotalKg ?? null,
        coletaId: coleta.id,
        dataColeta: coleta.createdAt.toISOString(),
      },
      debug: { mode: 'coleta-fallback', coletaId: coleta.id, rawId },
    };
  }

  if (!rawId) {
    const fb = await buildFromAnyColeta();
    return NextResponse.json(fb);
  }

  try {
    // =========================================
    // 1) ETIQUETA REAL: ItemVolume.etiqueta (unique)
    // =========================================
    const vol = await prisma.itemVolume.findUnique({
      where: { etiqueta: rawId },
      include: {
        itemColetado: {
          include: {
            Produto: true,
            Coleta: {
              include: {
                Cliente: true,
              },
            },
          },
        },
      },
    });

    if (vol?.itemColetado?.Coleta) {
      const coleta = vol.itemColetado.Coleta;
      const produto = vol.itemColetado.Produto;

      // total de volumes na coleta: soma de ItemVolume vinculados aos itens da coleta
      const allVols = await prisma.itemVolume.findMany({
        where: { itemColetado: { coletaId: coleta.id } },
        select: { etiqueta: true },
        orderBy: { etiqueta: 'asc' },
      });

      const totalVolumes = allVols.length || 1;
      const idx = allVols.findIndex((x) => x.etiqueta === rawId);
      const volumeNumero = idx >= 0 ? idx + 1 : 1;

      const nf = coleta.nf;
      const clienteNome = coleta.Cliente?.razao ?? 'Cliente não informado';
      const cidade = coleta.cidade || coleta.Cliente?.cidade || 'Cidade';
      const uf = coleta.uf || coleta.Cliente?.uf || 'UF';
      const dataColetaIso = coleta.createdAt.toISOString();

      // peso aproximado: usa produto.pesoKg se existir; se não, rateia pesoTotalKg da coleta
      let pesoKg: number | null = null;
      if (produto?.pesoKg != null) {
        const qtd = Number(vol.itemColetado?.quantidade ?? 1);
        pesoKg = produto.pesoKg * (Number.isFinite(qtd) ? qtd : 1);
      } else if (coleta.pesoTotalKg != null && totalVolumes > 0) {
        pesoKg = coleta.pesoTotalKg / totalVolumes;
      }

      const etiqueta = {
        id: vol.id,
        codigoEtiqueta: rawId,
        nf,
        cliente: clienteNome,
        cidade,
        uf,
        itemCodigo: produto?.code ?? 'SEM_CODIGO',
        itemDescricao: produto?.descricao ?? 'Produto sem descrição',
        volume: volumeNumero,
        totalVolumes,
        pesoKg,
        coletaId: coleta.id,
        dataColeta: dataColetaIso,
      };

      return NextResponse.json({
        ok: true,
        etiqueta,
        debug: { mode: 'db-itemVolume', rawId, coletaId: coleta.id, itemColetadoId: vol.itemColetadoId },
      });
    }

    // =========================================
    // 2) Fallback: tenta como ItemColetado.id (não por etiqueta)
    // =========================================
    const itemById = await prisma.itemColetado.findUnique({
      where: { id: rawId },
      include: {
        Produto: true,
        Coleta: { include: { Cliente: true } },
      },
    });

    if (itemById?.Coleta) {
      const coleta = itemById.Coleta;
      const produto = itemById.Produto;

      const allVols = await prisma.itemVolume.findMany({
        where: { itemColetado: { coletaId: coleta.id } },
        select: { etiqueta: true },
        orderBy: { etiqueta: 'asc' },
      });

      const totalVolumes = allVols.length || 1;

      let pesoKg: number | null = null;
      if (produto?.pesoKg != null) {
        pesoKg = produto.pesoKg * Number(itemById.quantidade ?? 1);
      } else if (coleta.pesoTotalKg != null && totalVolumes > 0) {
        pesoKg = coleta.pesoTotalKg / totalVolumes;
      }

      return NextResponse.json({
        ok: true,
        etiqueta: {
          id: itemById.id,
          codigoEtiqueta: rawId,
          nf: coleta.nf,
          cliente: coleta.Cliente?.razao ?? 'Cliente não informado',
          cidade: coleta.cidade || coleta.Cliente?.cidade || 'Cidade',
          uf: coleta.uf || coleta.Cliente?.uf || 'UF',
          itemCodigo: produto?.code ?? 'SEM_CODIGO',
          itemDescricao: produto?.descricao ?? 'Produto sem descrição',
          volume: 1,
          totalVolumes,
          pesoKg,
          coletaId: coleta.id,
          dataColeta: coleta.createdAt.toISOString(),
        },
        debug: { mode: 'db-itemColetadoId', rawId, coletaId: coleta.id },
      });
    }

    // =========================================
    // 3) Fallback final: qualquer coleta real
    // =========================================
    const fb = await buildFromAnyColeta();
    return NextResponse.json(fb);
  } catch (err: any) {
    console.error('GET /api/etiquetas/[id] error:', err);
    const fb = await buildFromAnyColeta();
    return NextResponse.json(fb);
  }
}