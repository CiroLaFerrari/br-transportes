// src/app/api/nfe/pdf/route.ts
// POST multipart/form-data { file: PDF }
// Extrai dados do DANFE e retorna o mesmo formato de /api/nfe/consultar

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ── Parser DANFE ────────────────────────────────────────────────────────────

function cleanNum(s: string): number {
  // "20.581,76" → 20581.76
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
}

function fmtCnpj(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length !== 14) return raw;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

interface ParsedItem {
  nItem: number;
  cProd: string;
  xProd: string;
  qCom: number;
  uCom: string;
  vProd: number;
  pesoLiq?: number;
}

interface ParsedNFe {
  chave: string;
  nNF: string;
  serie: string;
  dhEmi: string;
  emitente: { cnpj: string; razaoSocial: string; cidade: string; uf: string };
  destinatario?: { razaoSocial: string; cnpj: string; cidade: string; uf: string };
  vNF: number;
  pesoTotal?: number;
  itens: ParsedItem[];
}

function parseDanfe(raw: string): ParsedNFe {
  // Normalize
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const flat = text.replace(/\s+/g, ' ');

  // ── 1. Chave de acesso (44 dígitos contíguos) ──────────────────────────
  const chaveMatch = flat.replace(/\s/g, '').match(/\d{44}/);
  if (!chaveMatch) throw new Error('Chave de acesso (44 dígitos) não encontrada no PDF.');
  const chave = chaveMatch[0];

  // Decompõe a chave
  const aamm   = chave.slice(2, 6);
  const cnpjEmitRaw = chave.slice(6, 20);
  const serie  = chave.slice(22, 25).replace(/^0+/, '') || '1';
  const nNF    = String(parseInt(chave.slice(25, 34), 10));
  const ano    = '20' + aamm.slice(0, 2);
  const mes    = aamm.slice(2, 4);

  // ── 2. Data de emissão (dd/mm/aaaa no texto) ──────────────────────────
  const dateMatches = [...text.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)].map((m) => ({
    raw: m[0], d: m[1], mo: m[2], y: m[3],
  }));
  // Pega a primeira data do ano atual ou próximo (emissão)
  const dateEmissao = dateMatches.find((d) => d.y === ano || d.y === String(Number(ano) + 1));
  const dhEmi = dateEmissao
    ? `${dateEmissao.y}-${dateEmissao.mo}-${dateEmissao.d}T00:00:00`
    : `${ano}-${mes}-01T00:00:00`;

  // ── 3. CNPJs no texto ─────────────────────────────────────────────────
  const cnpjsTexto = [...text.matchAll(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g)].map((m) => m[0]);
  const cnpjsUniq  = [...new Set(cnpjsTexto)];

  // Emitente: CNPJ da chave
  const cnpjEmit = fmtCnpj(cnpjEmitRaw);
  // Destinatário: primeiro CNPJ diferente do emitente
  const cnpjDest = cnpjsUniq.find((c) => c.replace(/\D/g, '') !== cnpjEmitRaw) ?? '';

  // ── 4. Razões Sociais ─────────────────────────────────────────────────
  // Estratégia: procura o nome imediatamente antes/depois das labels EMITENTE/DESTINATÁRIO
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  function getNameNearLabel(label: RegExp): string {
    for (let i = 0; i < lines.length; i++) {
      if (label.test(lines[i])) {
        // Procura linha não-vazia seguinte que não seja um label conhecido
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const l = lines[j];
          if (l && !/^(CNPJ|CPF|IE|IM|FONE|TEL|RUA|AV|ROD|END|CEP|BAIRRO|NATUREZA|DATA|EMITENTE|DESTINAT)/i.test(l)) {
            // Tem aspecto de nome (≥ 5 chars, não começa com número)
            if (l.length >= 5 && !/^\d/.test(l)) return l;
          }
        }
      }
    }
    return '';
  }

  // Também tenta extração pelo CNPJ: nome = linha imediatamente antes do CNPJ
  function getNameByCnpj(cnpj: string): string {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(cnpj)) {
        // Linha anterior pode ser o nome
        for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
          const l = lines[j];
          if (l && l.length >= 5 && !/^\d/.test(l) && !/^(EMITENTE|DESTINAT|CNPJ|CPF|FONE|CEP)/i.test(l)) {
            return l;
          }
        }
        // Ou linha posterior
        for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
          const l = lines[j];
          if (l && l.length >= 5 && !/^\d/.test(l) && !/^(CNPJ|CPF|IE|IM|FONE|RUA|AV|ROD)/i.test(l)) {
            return l;
          }
        }
      }
    }
    return '';
  }

  const razaoEmit = getNameNearLabel(/EMITENTE/i) || getNameByCnpj(cnpjEmit) || 'Emitente';
  const razaoDest = getNameNearLabel(/DESTINAT/i) || getNameByCnpj(cnpjDest) || '';

  // ── 5. Cidade/UF do emitente e destinatário ───────────────────────────
  // Padrão: "CIDADE - SP", "CIDADE/SP", "CIDADE / SP"
  const cityUfRe = /([A-ZÁÇÃÕÉÀÊÎ][A-ZÁÇÃÕÉÀÊÎa-záçãõéàêî\s]{2,40})\s*[-\/]\s*([A-Z]{2})\b/g;
  const cityUfs = [...text.matchAll(cityUfRe)].map((m) => ({ city: m[1].trim(), uf: m[2] }));

  // Remove matches genéricos (SP 318 etc.)
  const validCityUfs = cityUfs.filter(
    (c) => !/^\d/.test(c.city) && c.city.length > 2 && !/^(ROD|BR|SP|RJ|RS|PR|MG|BA)\s*\d/i.test(c.city),
  );

  const cidadeEmit = validCityUfs[0]?.city ?? '';
  const ufEmit     = validCityUfs[0]?.uf  ?? chave.slice(0, 2);
  const cidadeDest = validCityUfs[1]?.city ?? '';
  const ufDest     = validCityUfs[1]?.uf  ?? '';

  // ── 6. Peso total ─────────────────────────────────────────────────────
  const pesoMatches = [...text.matchAll(/(\d+[\.,]\d+)\s*KG/gi)];
  const pesos = pesoMatches.map((m) => cleanNum(m[1])).filter((n) => n > 0);
  const pesoTotal = pesos.length > 0 ? Math.max(...pesos) : undefined;

  // ── 7. Valor total da NF ──────────────────────────────────────────────
  // "VALOR TOTAL DA NOTA" ou "TOTAL R$" etc.
  let vNF = 0;
  const totalRe = /(?:VALOR\s+TOTAL\s+(?:DA\s+)?NOTA|TOTAL\s+DA\s+NOTA)[^\d]*(\d[\d.,]+)/i;
  const totalMatch = text.match(totalRe);
  if (totalMatch) {
    vNF = cleanNum(totalMatch[1]);
  } else {
    // Fallback: maior valor monetário no documento
    const moneyMatches = [...text.matchAll(/R\$\s*([\d.,]+)/g)].map((m) => cleanNum(m[1]));
    if (moneyMatches.length) vNF = Math.max(...moneyMatches);
  }

  // ── 8. Itens / Produtos ────────────────────────────────────────────────
  const itens: ParsedItem[] = [];

  // Encontra seção de produtos: entre "CÓDIGO" header e "CÁLCULO"/"FATURA"/"TOTAIS"
  const prodSecStart = /(CÓDIGO\s+DESCRI[CÇ]ÃO|COD\.\s+DESC|DISCRIMIN)/i;
  const prodSecEnd   = /(CÁLCULO\s+DO\s+IMPOSTO|FATURA|DUPLICATA|TRANSPORTADOR|DADOS\s+DO\s+TRANSPORT)/i;

  const startIdx = lines.findIndex((l) => prodSecStart.test(l));
  const endIdx   = lines.findIndex((l, i) => i > startIdx + 1 && prodSecEnd.test(l));

  const prodLines = startIdx >= 0
    ? lines.slice(startIdx + 1, endIdx > 0 ? endIdx : lines.length)
    : [];

  // Padrão de linha de produto DANFE:
  // CODE  DESCRIPTION  NCM  CST  CFOP  UNIT  QTY  VUNIT  VDESC  VTOTAL
  // CFOPs começam com 1-9 e têm 4 dígitos (ex: 6101, 5102)
  // NCM tem 8 dígitos
  // Quantidade: número com vírgula (ex: 1,0000)

  const itemLineRe = /^(\S+)\s+(.+?)\s+(\d{8})\s+\d+\s+([1-9]\d{3})\s+([A-Z]{2,4})\s+([\d.,]+)\s+([\d.,]+)(?:\s+([\d.,]+))?\s*([\d.,]+)$/;
  // Alternativo mais flexível
  const itemLineRe2 = /^(\d[\dA-Z\-_.]{2,})\s+(.{8,}?)\s+([1-9]\d{3})\s+([A-Z]{2,4})\s+([\d.,]+)\s+([\d.,]+)(?:\s+[\d.,]+)?\s+([\d.,]+)$/;

  let nItem = 0;

  for (const line of prodLines) {
    const m = itemLineRe.exec(line) ?? itemLineRe2.exec(line);
    if (m) {
      nItem++;
      const cProd = m[1].trim();
      const xProd = m[2].trim();
      const qCom  = cleanNum(m[5] ?? m[4]);
      // last number-like group is total value
      const groups = m.slice(1).filter(Boolean);
      const vProd = cleanNum(groups[groups.length - 1]);

      itens.push({ nItem, cProd, xProd, qCom: qCom || 1, uCom: 'UN', vProd });
    }
  }

  // Se não conseguiu parsear produtos com regex estruturado,
  // tenta abordagem por NCM (8 dígitos) como âncora
  if (itens.length === 0) {
    for (let i = 0; i < prodLines.length; i++) {
      const line = prodLines[i];
      // Linha com NCM (8 dígitos)
      const ncmMatch = line.match(/\b(\d{8})\b/);
      if (!ncmMatch) continue;

      nItem++;
      // Código: token antes do texto de descrição (pode ser o início da linha)
      const beforeNcm = line.slice(0, line.indexOf(ncmMatch[0])).trim();
      // Tenta extrair código e descrição do trecho antes do NCM
      const tokens = beforeNcm.split(/\s+/);
      const cProd = tokens[0] ?? `ITEM-${nItem}`;
      const xProd = tokens.slice(1).join(' ').trim() || `Produto ${nItem}`;

      // Números depois do NCM: CFOP QTD VUNIT VTOTAL
      const afterNcm = line.slice(line.indexOf(ncmMatch[0]) + 8);
      const nums = [...afterNcm.matchAll(/([\d]+[.,][\d]+)/g)].map((m) => cleanNum(m[1]));
      const qCom = nums[nums.length > 2 ? nums.length - 3 : 0] ?? 1;
      const vProd = nums[nums.length - 1] ?? 0;

      itens.push({ nItem, cProd, xProd, qCom: qCom || 1, uCom: 'UN', vProd });
    }
  }

  // Último fallback: produto único pela descrição complementar
  if (itens.length === 0 && vNF > 0) {
    // Tenta achar o nome do produto nas linhas de informações complementares
    const descLine = lines.find(
      (l) => l.length > 15 && /[A-Z]{4,}/.test(l) && !/^(EMITENTE|DEST|CNPJ|CPF|END|RUA|ROD|FONE|IE|IM|CEP|BAIRRO)/.test(l),
    );
    itens.push({
      nItem: 1,
      cProd: nNF,
      xProd: descLine ?? 'Produto NF ' + nNF,
      qCom: 1,
      uCom: 'UN',
      vProd: vNF,
      pesoLiq: pesoTotal,
    });
  }

  return {
    chave,
    nNF,
    serie,
    dhEmi,
    emitente: { cnpj: cnpjEmit, razaoSocial: razaoEmit, cidade: cidadeEmit, uf: ufEmit },
    destinatario: razaoDest || cidadeDest
      ? { razaoSocial: razaoDest, cnpj: cnpjDest, cidade: cidadeDest, uf: ufDest }
      : undefined,
    vNF,
    pesoTotal,
    itens,
  };
}

// ── DB cross-reference (igual ao /api/nfe/consultar) ────────────────────────

async function findProduto(cProd: string, xProd: string) {
  const byCode = await prisma.produto.findUnique({
    where: { code: cProd },
    select: { id: true, code: true, descricao: true },
  });
  if (byCode) return { produto: byCode, matchType: 'código' as const };

  const words = xProd
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 3);

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

    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'O arquivo deve ser um PDF.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Extrai texto do PDF com pdf-parse
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse/lib/pdf-parse');
    const { text } = await pdfParse(buffer);

    if (!text || text.trim().length < 20) {
      return NextResponse.json(
        { error: 'Não foi possível ler texto do PDF. Verifique se o arquivo é um DANFE válido (não pode ser imagem escaneada).' },
        { status: 422 },
      );
    }

    // Parseia o DANFE
    const nfe = parseDanfe(text);

    // Cross-reference DB
    const [coletaExistente, clienteExistente] = await Promise.all([
      prisma.coleta.findFirst({ where: { nf: nfe.nNF }, select: { id: true, nf: true } }),
      prisma.cliente.findFirst({
        where: {
          OR: [
            { cnpj: nfe.emitente.cnpj },
            { cnpj: nfe.emitente.cnpj.replace(/\D/g, '') },
          ],
        },
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

    const novosProdutos = itensComStatus.filter((i) => !i.produtoExistente).length;

    return NextResponse.json({
      nfe: { ...nfe, itens: itensComStatus, isMock: false, fonte: 'pdf' },
      preview: {
        clienteExistente: clienteExistente ? { id: clienteExistente.id, razao: clienteExistente.razao } : null,
        coletaExistente:  coletaExistente  ? { id: coletaExistente.id,  nf: coletaExistente.nf }         : null,
        novosClientes:    clienteExistente ? 0 : 1,
        novosProdutos,
        totalItens: nfe.itens.length,
      },
    });
  } catch (e: any) {
    console.error('[nfe/pdf]', e);
    return NextResponse.json({ error: e.message ?? 'Erro ao processar PDF.' }, { status: 500 });
  }
}
