// src/app/api/nfe/pdf/route.ts
// POST multipart/form-data { file: PDF }
// Extrai dados do DANFE usando pdfjs-dist e retorna o mesmo formato de /api/nfe/consultar

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ── Extração de texto via pdfjs-dist ────────────────────────────────────────

async function extractText(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js') as any;
  const data = new Uint8Array(buffer);
  const doc  = await pdfjsLib.getDocument({ data }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page    = await doc.getPage(i);
    const content = await page.getTextContent();
    parts.push(content.items.map((x: any) => String(x.str ?? '')).join(' '));
  }
  return parts.join('\n');
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
  // ── 1. Chave de acesso ────────────────────────────────────────────────
  // Remove todos os espaços e procura sequência de 44 dígitos
  const noSpaces = text.replace(/\s+/g, '');
  const chaveMatch = noSpaces.match(/\d{44}/);
  if (!chaveMatch) throw new Error('Chave de acesso não encontrada no PDF. Verifique se o arquivo é um DANFE válido.');
  const chave = chaveMatch[0];

  // Decompõe a chave DANFE: UF(2) AAMM(4) CNPJ(14) MOD(2) SERIE(3) NNF(9) TPEMIS(1) CNUMERO(8) CDV(1)
  const aamm        = chave.slice(2, 6);
  const cnpjEmitRaw = chave.slice(6, 20);
  const serie       = String(parseInt(chave.slice(22, 25), 10)) || '1';
  const nNF         = String(parseInt(chave.slice(25, 34), 10));
  const ano         = '20' + aamm.slice(0, 2);
  const mes         = aamm.slice(2, 4);

  // ── 2. Data de emissão ────────────────────────────────────────────────
  const dates = [...text.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
  const emissaoDate = dates.find((m) => m[3] === ano || m[3] === String(Number(ano) + 1));
  const dhEmi = emissaoDate
    ? `${emissaoDate[3]}-${emissaoDate[2]}-${emissaoDate[1]}T00:00:00`
    : `${ano}-${mes}-01T00:00:00`;

  // ── 3. CNPJs no texto ─────────────────────────────────────────────────
  const cnpjsAll  = [...text.matchAll(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g)].map((m) => m[0]);
  const cnpjEmit  = fmtCnpj(cnpjEmitRaw);
  const cnpjDest  = cnpjsAll.find((c) => c.replace(/\D/g, '') !== cnpjEmitRaw) ?? '';

  // ── 4. Razão social do emitente ───────────────────────────────────────
  // pdfjs extrai o texto em ordem visual — o nome do emitente aparece logo após
  // "Recebemos de X os produtos..." ou logo antes/depois do CNPJ do emitente
  let razaoEmit = '';
  // Padrão: "Recebemos de [NOME] os produtos"
  const recebemosMatch = text.match(/Recebemos de\s+(.+?)\s+os produtos/i);
  if (recebemosMatch) razaoEmit = recebemosMatch[1].trim();

  // Fallback: nome depois do CNPJ emitente no texto
  if (!razaoEmit && cnpjEmit) {
    const idxCnpj = text.indexOf(cnpjEmit);
    if (idxCnpj >= 0) {
      const after = text.slice(idxCnpj + cnpjEmit.length, idxCnpj + cnpjEmit.length + 200);
      const parts = after.trim().split(/\s{2,}|\n/).map((s) => s.trim()).filter(Boolean);
      const candidate = parts.find(
        (p) => p.length > 5 && !/^(\d|CNPJ|CPF|IE|IM|FONE|CEP|RUA|AV|ROD)/.test(p),
      );
      if (candidate) razaoEmit = candidate;
    }
  }
  razaoEmit = razaoEmit || 'Emitente';

  // ── 5. Razão social do destinatário ──────────────────────────────────
  // Aparece após "NOME / RAZÃO SOCIAL" na seção destinatário
  let razaoDest = '';
  const nomeLabelIdx = text.lastIndexOf('NOME / RAZÃO SOCIAL');
  if (nomeLabelIdx >= 0) {
    const after = text.slice(nomeLabelIdx + 20, nomeLabelIdx + 200);
    const parts = after.trim().split(/\n|\s{3,}/).map((s) => s.trim()).filter(Boolean);
    const candidate = parts.find(
      (p) => p.length > 5 && !/^(NOME|DATA|CNPJ|CPF|CEP|UF|END|RUA|ROD|AV|BAIRRO|FONE|IE)/.test(p),
    );
    if (candidate) razaoDest = candidate;
  }

  // ── 6. Cidade/UF do emitente ──────────────────────────────────────────
  // Padrão "Pompeia - SP" ou "CIDADE  UF  BA"
  const cityUfRe = /([A-ZÁÇÃÕÉÀÊÎ][A-ZÁÇÃÕÉÀÊÎa-záçãõéàêî\s]{2,30})\s*-\s*([A-Z]{2})\b/g;
  const cityUfs  = [...text.matchAll(cityUfRe)]
    .map((m) => ({ city: m[1].trim(), uf: m[2] }))
    .filter((c) => c.city.length > 2 && !/^\d/.test(c.city) && !/^(ROD|BR|SP\s*\d|CEP)/.test(c.city));

  const cidadeEmit = cityUfs[0]?.city ?? '';
  const ufEmit     = cityUfs[0]?.uf  ?? chave.slice(0, 2);

  // Destinatário — cidade e UF
  // Geralmente "MUNICÍPIO  JUAZEIRO  UF  BA"
  let cidadeDest = '', ufDest = '';
  const municipioMatch = text.match(/MUNIC[IÍ]PIO\s+([A-ZÁÇÃÕÉÀÊÎ][^\n\t]+?)\s+UF\s+([A-Z]{2})/i);
  if (municipioMatch) {
    cidadeDest = municipioMatch[1].trim();
    ufDest     = municipioMatch[2].trim();
  } else if (cityUfs[1]) {
    cidadeDest = cityUfs[1].city;
    ufDest     = cityUfs[1].uf;
  }

  // ── 7. Peso total ─────────────────────────────────────────────────────
  const pesoMatch = text.match(/PESO\s+BRUTO\s+([\d.,]+)\s*KG/i);
  const pesoTotal = pesoMatch ? cleanNum(pesoMatch[1]) : undefined;

  // ── 8. Valor total da nota ────────────────────────────────────────────
  let vNF = 0;
  const totalMatch = text.match(/VALOR\s+TOTAL\s+DA\s+NOTA\s+([\d.,]+)/i);
  if (totalMatch) vNF = cleanNum(totalMatch[1]);
  if (!vNF) {
    // Fallback: maior valor em reais no documento
    const moneys = [...text.matchAll(/R\$\s*([\d.,]+)/g)].map((m) => cleanNum(m[1]));
    if (moneys.length) vNF = Math.max(...moneys);
  }

  // ── 9. Produtos ───────────────────────────────────────────────────────
  const itens: ParsedItem[] = [];

  // Estratégia principal: extrai produtos da seção "DADOS DOS PRODUTOS / SERVIÇOS"
  // O pdfjs retorna o texto de forma contínua. Procura o bloco entre o header de
  // produtos e INFORMAÇÕES COMPLEMENTARES / CÁLCULO DO IMPOSTO
  const prodStart = text.search(/DADOS\s+DOS\s+PRODUTOS|COD[IÍ]GO\s+PRODUTO\s+DESCRI/i);
  const prodEnd   = text.search(/INFORMA[ÇC][ÕO]ES\s+COMPLEMENTARES|RESERVADO\s+AO\s+FISCO|CÁLCULO\s+DO\s+IMPOSTO/i);

  const prodBlock = prodStart >= 0
    ? text.slice(prodStart, prodEnd > prodStart ? prodEnd : prodStart + 2000)
    : '';

  if (prodBlock) {
    // Cada produto: [código] [descrição] [info extras] [NCM 8 dígitos] [CST 3 digs] [CFOP 4 digs] [UNID] [qtd] [v.unit] [desc] [0,00] [total] ...
    // NCM ancora o produto: 8 dígitos consecutivos
    const ncmRe = /\b(\d{8})\b/g;
    let ncmMatch: RegExpExecArray | null;
    const ncmPositions: number[] = [];
    while ((ncmMatch = ncmRe.exec(prodBlock)) !== null) ncmPositions.push(ncmMatch.index);

    for (let pi = 0; pi < ncmPositions.length; pi++) {
      const pos     = ncmPositions[pi];
      const nextPos = ncmPositions[pi + 1] ?? prodBlock.length;

      // Texto antes do NCM = código + descrição
      // Texto depois do NCM = CST CFOP UNID QTD VUNIT VDESC VTOTAL ...
      const before = prodBlock.slice(Math.max(0, pos - 600), pos).trim();
      const after  = prodBlock.slice(pos + 8, nextPos).trim();

      // Extrai todos os números do "after"
      const nums   = [...after.matchAll(/([\d]+[.,][\d]+)/g)].map((m) => cleanNum(m[1]));
      // Extrai CFOP: 4 dígitos iniciando em 1-9 logo após o NCM
      const cfopMatch = after.match(/\b([1-9]\d{3})\b/);
      // Extrai unidade: 2-4 letras maiúsculas
      const unidMatch = after.match(/\b([A-Z]{2,4})\b/);

      // Quantidade: primeiro número com vírgula (ex: 1,0000)
      const qtyMatch  = after.match(/([\d]+,[\d]+)/);
      const qCom      = qtyMatch ? cleanNum(qtyMatch[1]) : 1;

      // Valor total: geralmente o terceiro ou quarto número de formato "NN.NNN,NN"
      const realVals = nums.filter((n) => n > 10 && n > qCom);
      const vProd    = realVals.length > 0 ? realVals[realVals.length - 1] : vNF;

      // Código e descrição do "before"
      // Tokens do before: separar por espaços múltiplos
      const beforeTokens = before.split(/\s{2,}|\n/).map((s) => s.trim()).filter(Boolean);
      // Último token relevante é o código (números), anterior é a descrição
      // Procura por código: sequência de dígitos/letras sem espaços
      let cProd = `ITEM-${pi + 1}`;
      let xProd = '';

      // Estratégia: último token do before que parece código
      for (let ti = beforeTokens.length - 1; ti >= 0; ti--) {
        const tok = beforeTokens[ti];
        if (/^[\dA-Z\-_.\/]{3,}$/.test(tok)) {
          cProd = tok;
          xProd = beforeTokens.slice(0, ti).join(' ').trim() ||
            beforeTokens.slice(ti + 1).join(' ').trim();
          break;
        }
      }
      if (!xProd) xProd = beforeTokens.filter((t) => t !== cProd).join(' ').trim();

      // Limpa descrição: remove textos de cabeçalho
      xProd = xProd
        .replace(/DADOS\s+DOS\s+PRODUTOS[^]*?ALÍQ\.\s*%/i, '')
        .replace(/COD[IÍ]GO\s+PRODUTO\s+DESCRI[ÇC][AÃ]O[^]*?VALOR\s+TOTAL/i, '')
        .replace(/CÓDIGO\s+PRODUTO.*/i, '')
        .trim();

      if (!xProd || xProd.length < 3) xProd = `Produto ${pi + 1}`;

      itens.push({
        nItem: pi + 1, cProd, xProd,
        qCom: qCom || 1,
        uCom: unidMatch?.[1] ?? 'UN',
        vProd: vProd || vNF,
      });
    }
  }

  // ── 9b. Enriquece com dados de INFORMAÇÕES COMPLEMENTARES ─────────────
  // Padrão: "PRODUTO:1331979 . MAQUINA NR.:xxx"
  const infoComp = text.match(/INFORMA[ÇC][ÕO]ES\s+COMPLEMENTARES\s+([\s\S]{0,2000})/i)?.[1] ?? '';
  const prodCodesInfo = [...infoComp.matchAll(/PRODUTO\s*:\s*(\d+)/gi)].map((m) => m[1]);

  if (itens.length === 0 && prodCodesInfo.length === 0) {
    // Último fallback: cria 1 item com o que temos
    itens.push({
      nItem: 1, cProd: nNF, xProd: `Produto NF ${nNF}`, qCom: 1, uCom: 'UN', vProd: vNF, pesoLiq: pesoTotal,
    });
  }

  // Aplica os códigos reais das informações complementares
  for (let i = 0; i < itens.length && i < prodCodesInfo.length; i++) {
    itens[i].cProd = prodCodesInfo[i];
  }

  // Também tenta melhorar a descrição pelo bloco após o código nas inf. complementares
  const descRe = /\|\|?\d+\s*-\s*([^\n|]{10,200})/g;
  const descMatches = [...infoComp.matchAll(descRe)];
  for (let i = 0; i < itens.length && i < descMatches.length; i++) {
    const fullDesc = descMatches[i][1].trim();
    if (fullDesc.length > itens[i].xProd.length) {
      // Mantém a primeira parte (nome do produto) como descrição
      itens[i].xProd = fullDesc.slice(0, fullDesc.indexOf('Reservatorio') > 0 ? fullDesc.indexOf('Reservatorio') : 120).trim();
    }
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
