import crypto from "crypto";
import { prisma } from "@/lib/prisma";

function novaEtiqueta() {
  return crypto.randomBytes(10).toString("hex");
}

type ItemReq = {
  produtoCodigo: string;
  quantidade: number;
};

type ColetaReq = {
  clienteId: string;
  nf: string;
  cidade: string;
  uf: string;
  valorFrete?: number;
  itens: ItemReq[];
};

export async function criarColetasComVolumes(
  tx: typeof prisma,
  coletas: ColetaReq[]
) {
  for (const c of coletas) {
    // 1) cria a coleta
    const coleta = await tx.coleta.create({
      data: {
        clienteId: c.clienteId,
        nf: c.nf,
        cidade: c.cidade,
        uf: c.uf,
        valorFrete: c.valorFrete ?? null,
        status: "EM_PATIO",
        entradaPatioAt: new Date(),
      },
    });

    // 2) busca produtos por código
    const codigos = c.itens.map((i) => i.produtoCodigo);
    const produtos = await tx.produto.findMany({
      where: { code: { in: codigos } }, // seu campo Prisma é "code" mapeado para "codigo"
      include: { componentes: true },
    });

    const map = new Map(produtos.map((p) => [p.code, p]));

    // 3) cria itens + volumes/etiquetas
    for (const it of c.itens) {
      const produto = map.get(it.produtoCodigo);
      if (!produto) throw new Error(`Produto não encontrado: ${it.produtoCodigo}`);

      const item = await tx.itemColetado.create({
        data: {
          coletaId: coleta.id,
          produtoId: produto.id,
          quantidade: it.quantidade,
        },
      });

      // Regra:
      // - se desmontável + tem componentes: 1 etiqueta por componente (considerando componente.quantidade) * quantidade do item
      // - senão: 1 etiqueta por unidade * quantidade do item
      const volumes: { etiqueta: string; componenteId?: string | null }[] = [];

      const desmontavel = !!produto.desmontavel && produto.componentes?.length;

      if (desmontavel) {
        for (let q = 0; q < it.quantidade; q++) {
          for (const comp of produto.componentes) {
            const qtdComp = (comp as any).quantidade ?? 1; // seu Componente tem quantidade
            for (let k = 0; k < qtdComp; k++) {
              volumes.push({ etiqueta: novaEtiqueta(), componenteId: comp.id });
            }
          }
        }
      } else {
        for (let q = 0; q < it.quantidade; q++) {
          volumes.push({ etiqueta: novaEtiqueta(), componenteId: null });
        }
      }

      if (volumes.length) {
        await tx.itemVolume.createMany({
          data: volumes.map((v) => ({
            itemColetadoId: item.id,
            etiqueta: v.etiqueta,
            componenteId: v.componenteId ?? null,
          })),
        });
      }
    }
  }
}
