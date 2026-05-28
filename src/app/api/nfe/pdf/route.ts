// src/app/api/nfe/pdf/route.ts
// POST multipart/form-data { file: PDF }
// Extrai dados do DANFE usando pdfjs-dist e retorna o mesmo formato de /api/nfe/consultar

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ── Extração de texto via pdf-parse v1 ──────────────────────────────────────
// Usa o caminho /lib/pdf-parse.js para evitar o carregamento de arquivos
// de teste que causam erros no Next.js App Router (serverless)

async function extractText(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse/lib/pdf-parse.js');
  const { text } = await pdfParse(buffer);
  return text;
}

// ── Parser DANFE ────────────────────────────────────────────────────────────

function cleanNum(s: string): number {
  return parseFloat(String(s).replace(/\./g, '').replace(',', '.')) || 0;
}

function fmtCnpj(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length !== 14) return raw;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

interface ParsedItem {
  nItem: number; cProd: string; xProd: string;
  qCom: number; uCom: string; vProd: number; pesoLiq?: number;
}

interface ParsedNFe {
  chave: string; nNF: string; serie: string; dhEmi: string;
  emitente: { cnpj: string; razaoSocial: string; cidade: string; uf: string };
  destinatario?: { razaoSocial: string; cnpj: string; cidade: string; uf: string };
  vNF: number; pesoTotal?: number; itens: ParsedItem[];
}

function parseDanfe(text: string): ParsedNFe {
  const lines = text.split('\n').map((l) => l.trim());

  // ── 1. Chave de acesso (linha única com 44 dígitos) ────────────────────
  const chave = lines.find((l) => /^\d{44}$/.test(l.replace(/\s/g, '')))?.replace(/\s/g, '')
    ?? text.replace(/\s/g, '').match(/\d{44}/)?.[0]
    ?? '';
  if (!chave) throw new Error('Chave de acesso não encontrada no PDF. Verifique se o arquivo é um DANFE válido.');

  // Decompõe a chave: UF(2) AAMM(4) CNPJ(14) MOD(2) SERIE(3) NNF(9) ...
  const aamm        = chave.slice(2, 6);
  const cnpjEmitRaw = chave.slice(6, 20);
  const serie       = String(parseInt(chave.slice(22, 25), 10)) || '1';
  const nNF         = String(parseInt(chave.slice(25, 34), 10));
  const ano         = '20' + aamm.slice(0, 2);
  const mes         = aamm.slice(2, 4);

  // ── 2. Data de emissão ────────────────────────────────────────────────
  // pdf-parse v1 dá uma linha por campo, DATA DA EMISSÃO é seguida pela data
  const dataEmissaoIdx = lines.findIndex((l) => /DATA\s+DA\s+EMISS[AÃ]O/i.test(l));
  const dataLine = dataEmissaoIdx >= 0
    ? lines.slice(dataEmissaoIdx + 1, dataEmissaoIdx + 4).find((l) => /\d{2}\/\d{2}\/\d{4}/.test(l))
    : undefined;
  const dateMatch = dataLine?.match(/(\d{2})\/(\d{2})\/(\d{4})/)
    ?? text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const dhEmi = dateMatch
    ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00`
    : `${ano}-${mes}-01T00:00:00`;

  // ── 3. CNPJs ──────────────────────────────────────────────────────────
  const cnpjsAll = [...text.matchAll(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g)].map((m) => m[0]);
  const cnpjEmit = fmtCnpj(cnpjEmitRaw);
  const cnpjDest = cnpjsAll.find((c) => c.replace(/\D/g, '') !== cnpjEmitRaw) ?? '';

  // ── 4. Razão social emitente ──────────────────────────────────────────
  // "Recebemos de [NOME] os produtos" ou linha seguinte ao CNPJ emitente
  let razaoEmit = text.match(/Recebemos de\s+(.+?)\s+os produtos/i)?.[1]?.trim() ?? '';
  if (!razaoEmit) {
    const cnpjIdx = lines.findIndex((l) => l.includes(cnpjEmit));
    if (cnpjIdx >= 0) {
      const candidate = lines.slice(cnpjIdx + 1, cnpjIdx + 4)
        .find((l) => l.length > 5 && !/^(\d|CNPJ|CPF|IE|FONE|\()/.test(l));
      razaoEmit = candidate ?? '';
    }
  }
  razaoEmit = razaoEmit || 'Emitente';

  // ── 5. Razão social destinatário ──────────────────────────────────────
  // pdf-parse v1: "NOME / RAZÃO SOCIAL" → próxima linha não-vazia é o nome
  let razaoDest = '';
  // Há dois labels "NOME / RAZÃO SOCIAL": emitente e destinatário
  // O segundo é o destinatário
  const nomeLabelIdxs = lines.reduce<number[]>((acc, l, i) => {
    if (/NOME\s*\/\s*RAZ[ÃA]O\s+SOCIAL/i.test(l)) acc.push(i);
    return acc;
  }, []);
  const destNomeIdx = nomeLabelIdxs[nomeLabelIdxs.length - 1] ?? -1;
  if (destNomeIdx >= 0) {
    const candidate = lines.slice(destNomeIdx + 1, destNomeIdx + 5)
      .find((l) => l.length > 5 && !/^(NOME|DATA|CNPJ|CPF|CEP|UF\b|END|FONE|IE)/.test(l));
    razaoDest = candidate ?? '';
  }

  // ── 6. Cidade/UF emitente ─────────────────────────────────────────────
  // Linha de endereço do emitente: "..., Pompeia - SP"
  const cityUfRe = /([A-ZÁÇÃÕÉÀÊÎ][A-ZÁÇÃÕÉÀÊÎa-záçãõéàêî\s]{1,30})\s*-\s*([A-Z]{2})$/;
  const enderecoEmitLine = lines.find((l) => cityUfRe.test(l) && !/^(ROD|BR)\s/.test(l));
  const cityUfMatch = enderecoEmitLine?.match(cityUfRe);
  const cidadeEmit  = cityUfMatch?.[1]?.trim() ?? '';
  const ufEmit      = cityUfMatch?.[2] ?? chave.slice(0, 2);

  // ── 7. Cidade/UF destinatário ─────────────────────────────────────────
  // pdf-parse v1: label "MUNICÍPIO" seguido da cidade, label "UF" seguido da UF
  let cidadeDest = '', ufDest = '';
  const municipioIdx = lines.lastIndexOf('MUNICÍPIO');
  if (municipioIdx >= 0) {
    cidadeDest = lines[municipioIdx + 1] ?? '';
    // UF vem após
    const ufLabelIdx = lines.indexOf('UF', municipioIdx);
    if (ufLabelIdx >= 0) ufDest = lines[ufLabelIdx + 1]?.trim() ?? '';
  }

  // ── 8. Peso total ─────────────────────────────────────────────────────
  const pesoIdx   = lines.findIndex((l) => /PESO\s+BRUTO/i.test(l));
  const pesoLine  = pesoIdx >= 0 ? lines[pesoIdx + 1] : '';
  const pesoMatch = (pesoLine + ' ' + text).match(/(\d[\d.,]+)\s*KG/i);
  const pesoTotal = pesoMatch ? cleanNum(pesoMatch[1]) : undefined;

  // ── 9. Valor total da nota ────────────────────────────────────────────
  // pdf-parse v1: label "VALOR TOTAL DA NOTA" seguido do valor (próxima linha)
  let vNF = 0;
  const vNFIdx = lines.findIndex((l) => /VALOR\s+TOTAL\s+DA\s+NOTA/i.test(l));
  if (vNFIdx >= 0) {
    const vLine = lines.slice(vNFIdx + 1, vNFIdx + 4).find((l) => /[\d.,]/.test(l));
    if (vLine) vNF = cleanNum(vLine.match(/([\d.,]+)/)?.[1] ?? '0');
  }
  if (!vNF) {
    const moneys = [...text.matchAll(/R\$\s*([\d.,]+)/g)].map((m) => cleanNum(m[1]));
    if (moneys.length) vNF = Math.max(...moneys);
  }

  // ── 10. Produtos — via INFORMAÇÕES COMPLEMENTARES (mais confiável) ────
  // Padrão: "PRODUTO:1331979 . MAQUINA NR.:xxx"
  // Padrão descrição: "||000...1331979 - CONDOR M.12 PULVERIZADOR..."
  const infoCompIdx = lines.findIndex((l) => /INFORMA[ÇC][ÕO]ES\s+COMPLEMENTARES/i.test(l));
  const infoCompText = infoCompIdx >= 0
    ? lines.slice(infoCompIdx, infoCompIdx + 30).join('\n')
    : '';

  const prodCodesInfo = [...infoCompText.matchAll(/PRODUTO\s*:\s*(\d+)/gi)].map((m) => m[1]);

  // Descrição longa do produto nas inf. complementares
  // Padrão: "||000...XXXX - NOME DO PRODUTO Detalhes..."
  const longDescRe = /\|\|?\d+\s*-\s*([A-Z][^\n]{5,})/g;
  const longDescs  = [...infoCompText.matchAll(longDescRe)].map((m) => m[1].trim());

  // ── 10b. Produtos — via tabela DADOS DOS PRODUTOS ─────────────────────
  const itens: ParsedItem[] = [];
  const prodTableIdx = lines.findIndex((l) => /DADOS\s+DOS\s+PRODUTOS/i.test(l));

  if (prodTableIdx >= 0) {
    // Bloco da tabela de produtos até INFORMAÇÕES COMPLEMENTARES
    const tableEnd = infoCompIdx > prodTableIdx ? infoCompIdx : prodTableIdx + 50;
    const tableLines = lines.slice(prodTableIdx + 1, tableEnd);

    // NCM ancora cada produto (8 dígitos numa linha que começa com números)
    // Em pdf-parse v1, o bloco fica colado: "842449000206101UN1,0000"
    // Procura por linhas que contenham 8+ dígitos consecutivos (NCM)
    const ncmLineRe = /\b(\d{8})\d*[A-Z]+([\d,]+)/;

    let currentCode = '';
    let currentDesc = '';
    let nItem       = 0;

    for (let li = 0; li < tableLines.length; li++) {
      const l = tableLines[li];

      // Linha de código (só dígitos, geralmente 14+ chars) — ex: "00000000000133"
      if (/^\d{8,}$/.test(l)) {
        currentCode = l;
        continue;
      }

      // Continuação do código (parte 2) — ex: "1979"
      if (currentCode && /^\d{1,8}$/.test(l) && currentDesc === '') {
        currentCode += l;
        continue;
      }

      // Linha de descrição do produto (texto com letras e espaços)
      if (currentCode && !currentDesc && /[A-Z]{3}/.test(l) &&
          !/^(DADOS|CÓDIGO|NCM|CST|CFOP|ICMS|IPI|PIS|COFINS|BASE|VALOR|ALÍQ|DESCRIÇÃO|PRODUTO)/.test(l)) {
        currentDesc = l.replace(/\s{2,}/g, ' ').trim();
        continue;
      }

      // Linha com NCM colado (ex: "842449000206101UN1,0000")
      const ncmMatch = ncmLineRe.exec(l);
      if (ncmMatch && currentDesc) {
        // Extrai quantidade (primeiro número com vírgula após o NCM block)
        const qtyMatch = l.match(/([A-Z]{2,4})([\d]+,[\d]+)/);
        const qCom     = qtyMatch ? cleanNum(qtyMatch[2]) : 1;

        nItem++;
        itens.push({
          nItem,
          cProd: currentCode.replace(/^0+/, '') || `ITEM-${nItem}`,
          xProd: currentDesc,
          qCom:  qCom || 1,
          uCom:  qtyMatch?.[1] ?? 'UN',
          vProd: vNF, // será refinado abaixo
        });
        currentCode = '';
        currentDesc = '';
        continue;
      }

      // Linha de valor total do item (ex: "20.581,76" — primeira linha de valor após NCM block)
      if (itens.length > 0 && /^\d[\d.]*,\d{2}$/.test(l) && itens[itens.length - 1].vProd === vNF) {
        itens[itens.length - 1].vProd = cleanNum(l);
      }
    }
  }

  // Aplica código e descrição das informações complementares (mais limpos)
  for (let i = 0; i < itens.length; i++) {
    if (prodCodesInfo[i]) itens[i].cProd = prodCodesInfo[i];
    if (longDescs[i]) {
      // Pega até a primeira vírgula ou "Reservatorio" (onde começam os detalhes)
      const cleanDesc = longDescs[i]
        .replace(/\s{2,}/g, ' ')
        .split(/\s*(?:Reservatorio|Reservatório|,\s*\d)/i)[0]
        .trim();
      if (cleanDesc.length >= itens[i].xProd.length) itens[i].xProd = cleanDesc;
    }
  }

  // Fallback se não encontrou produtos pela tabela
  if (itens.length === 0) {
    itens.push({
      nItem: 1,
      cProd: prodCodesInfo[0] ?? nNF,
      xProd: longDescs[0]?.split(/\s*(?:Reservatorio|Reservatório)/i)[0]?.trim() ?? `Produto NF ${nNF}`,
      qCom: 1, uCom: 'UN', vProd: vNF, pesoLiq: pesoTotal,
    });
  }

  return {
    chave, nNF, serie, dhEmi,
    emitente: { cnpj: cnpjEmit, razaoSocial: razaoEmit, cidade: cidadeEmit, uf: ufEmit },
    destinatario: (razaoDest || cidadeDest)
      ? { razaoSocial: razaoDest, cnpj: cnpjDest, cidade: cidadeDest, uf: ufDest }
      : undefined,
    vNF, pesoTotal, itens,
  };
}

// ── DB cross-reference ───────────────────────────────────────────────────────

async function findProduto(cProd: string, xProd: string) {
  const byCode = await prisma.produto.findUnique({
    where: { code: cProd },
    select: { id: true, code: true, descricao: true },
  });
  if (byCode) return { produto: byCode, matchType: 'código' as const };

  const words = xProd.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(' ').filter((w) => w.length >= 3);
  if (words.length >= 2) {
    const all = await prisma.produto.findMany({ select: { id: true, code: true, descricao: true } });
    let best: { produto: (typeof all)[0]; score: number } | null = null;
    for (const p of all) {
      const desc  = p.descricao.toUpperCase();
      const hits  = words.filter((w) => desc.includes(w)).length;
      const score = hits / words.length;
      if (score >= 0.6 && (!best || score > best.score)) best = { produto: p, score };
    }
    if (best) return { produto: best.produto, matchType: 'descrição' as const };
  }
  return null;
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file     = formData.get('file') as File | null;

    if (!file)  return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'O arquivo deve ser um PDF (.pdf).' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Extrai texto
    const text = await extractText(buffer);

    if (!text || text.trim().length < 30) {
      return NextResponse.json(
        { error: 'Não foi possível extrair texto do PDF. Verifique se é um DANFE válido (não pode ser imagem escaneada).' },
        { status: 422 },
      );
    }

    // Parseia DANFE
    const nfe = parseDanfe(text);

    // Cross-reference DB
    const [coletaExistente, clienteExistente] = await Promise.all([
      prisma.coleta.findFirst({ where: { nf: nfe.nNF }, select: { id: true, nf: true } }),
      prisma.cliente.findFirst({
        where: { OR: [{ cnpj: nfe.emitente.cnpj }, { cnpj: nfe.emitente.cnpj.replace(/\D/g, '') }] },
        select: { id: true, razao: true },
      }),
    ]);

    const itensComStatus = await Promise.all(
      nfe.itens.map(async (item) => {
        const match = await findProduto(item.cProd, item.xProd);
        return {
          ...item,
          produtoExistente: match
            ? { id: match.produto.id, code: match.produto.code, descricao: match.produto.descricao, matchType: match.matchType }
            : null,
        };
      }),
    );

    return NextResponse.json({
      nfe: { ...nfe, itens: itensComStatus, isMock: false, fonte: 'pdf' },
      preview: {
        clienteExistente: clienteExistente ? { id: clienteExistente.id, razao: clienteExistente.razao } : null,
        coletaExistente:  coletaExistente  ? { id: coletaExistente.id,  nf: coletaExistente.nf }         : null,
        novosClientes:    clienteExistente ? 0 : 1,
        novosProdutos:    itensComStatus.filter((i) => !i.produtoExistente).length,
        totalItens:       nfe.itens.length,
      },
    });
  } catch (e: any) {
    console.error('[nfe/pdf]', e);
    return NextResponse.json({ error: e.message ?? 'Erro ao processar PDF.' }, { status: 500 });
  }
}
