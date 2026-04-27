/**
 * migrate-items.js
 *
 * Lê a aba "ENT" do BKP_FORMAÇÃO DE CARGA - Copia.xlsm,
 * cria registros de ItemColetado vinculando cada NF ao produto correspondente.
 *
 * Estratégia de match de produto:
 *   1. Extrai quantidade e nome/código do campo ITEM (ex: "3 AM DE DISCO")
 *   2. Busca no banco produto cujo code OU descricao contém o texto (case-insensitive)
 *   3. Se não encontrar, registra como não-matchado e pula
 *
 * Uso: node scripts/migrate-items.js [--dry-run]
 */

const path = require('path');
const xlsx = require('xlsx');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

// ── Parser da coluna ITEM: "3 AM DE DISCO" → { qty: 3, nome: "AM DE DISCO" }
function parseItem(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d+)\s+(.+)/);
  if (!m) return { qty: 1, nome: s };
  return { qty: parseInt(m[1], 10) || 1, nome: m[2].trim() };
}

// ── Normaliza string para busca ────────────────────────────────────────────
function norm(s) {
  return String(s ?? '').toUpperCase().replace(/[\s\-_.\/]+/g, ' ').trim();
}

// ── Busca produto por código ou descrição ─────────────────────────────────
// Usa scoring: match exato > substring no código > substring na descrição
function findBestProduct(nomeBusca, products) {
  const query = norm(nomeBusca);
  if (!query) return null;

  const words = query.split(' ').filter((w) => w.length >= 3);
  if (words.length === 0) return null;

  let best = null;
  let bestScore = 0;

  for (const p of products) {
    const code = norm(p.code);
    const desc = norm(p.descricao);

    let score = 0;

    // Exact code match
    if (code === query) { score = 1000; }
    // Code contains query
    else if (code.includes(query)) { score = 500; }
    // Query contains code (quando item é abreviado)
    else if (query.includes(code) && code.length > 3) { score = 400; }
    // All words found in code
    else if (words.every((w) => code.includes(w))) { score = 300; }
    // All words found in description
    else if (words.every((w) => desc.includes(w))) { score = 200; }
    // Most words found
    else {
      const codeHits = words.filter((w) => code.includes(w)).length;
      const descHits = words.filter((w) => desc.includes(w)).length;
      const best2 = Math.max(codeHits, descHits);
      if (best2 > 0) {
        score = Math.round((best2 / words.length) * 100);
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = { produto: p, score };
    }
  }

  // Exige score mínimo de 100 (pelo menos 1 palavra de 3+ chars encontrada)
  return bestScore >= 100 ? best : null;
}

async function main() {
  console.log('=== MIGRAÇÃO DE ITENS DE COLETA ===');
  console.log(DRY_RUN ? '[DRY RUN — nenhuma alteração será salva]\n' : '[MODO REAL — vai salvar no banco]\n');

  // 1. Ler Excel ENT
  const xlsxPath = path.join(__dirname, '..', 'BKP_FORMAÇÃO DE CARGA - Copia.xlsm');
  const wb = xlsx.readFile(xlsxPath);
  const ws = wb.Sheets['ENT'];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  // Headers: row 5 → [,'', 'Nota Fiscal','Cliente','cidade','UF','ITEM','Peso','Valor NF','Coleta','Coletador',...]
  // Data: row 6+

  // 2. Carregar todos os produtos em memória
  console.log('Carregando produtos do banco...');
  const allProducts = await prisma.produto.findMany({
    select: { id: true, code: true, descricao: true },
  });
  console.log(`  ${allProducts.length} produtos carregados\n`);

  // 3. Carregar mapa NF → coletaId
  console.log('Carregando coletas do banco...');
  const allColetas = await prisma.coleta.findMany({
    select: { id: true, nf: true },
  });
  const nfMap = new Map(); // nf_string → coletaId
  for (const c of allColetas) {
    // Armazenar NF sem zeros à esquerda (string numérica normalizada)
    const nfNorm = String(c.nf).trim().replace(/^0+/, '') || c.nf;
    if (!nfMap.has(nfNorm)) nfMap.set(nfNorm, c.id);
  }
  console.log(`  ${allColetas.length} coletas carregadas (${nfMap.size} NFs únicas)\n`);

  // 4. Verificar quais coletas já têm itens (para não duplicar)
  const coletasComItens = new Set();
  const existingItems = await prisma.itemColetado.findMany({ select: { coletaId: true } });
  for (const i of existingItems) coletasComItens.add(i.coletaId);
  console.log(`Coletas que já têm itens: ${coletasComItens.size}\n`);

  // 5. Processar linhas
  let totalRows = 0, created = 0, skippedNoNF = 0;
  let skippedNoProd = 0, skippedDup = 0, skippedNoItem = 0;
  const notMatched = new Set();
  const batchSize = 200;
  const batch = [];

  for (let i = 6; i < rows.length; i++) {
    const r = rows[i];
    const nfRaw  = r[2];
    const item   = r[6];

    if (!nfRaw || !String(nfRaw).trim()) continue;
    totalRows++;

    const nfNorm = String(nfRaw).trim().replace(/^0+/, '') || String(nfRaw).trim();
    const coletaId = nfMap.get(nfNorm);

    if (!coletaId) { skippedNoNF++; continue; }
    if (coletasComItens.has(coletaId)) { skippedDup++; continue; }

    const parsed = parseItem(item);
    if (!parsed || !parsed.nome) { skippedNoItem++; continue; }

    const result = findBestProduct(parsed.nome, allProducts);
    if (!result) {
      skippedNoProd++;
      notMatched.add(parsed.nome);
      continue;
    }

    // Gera etiqueta única
    const etiqueta = `MIG-${nfNorm}-${String(i).padStart(5, '0')}`;

    batch.push({
      coletaId,
      produtoId: result.produto.id,
      quantidade: parsed.qty,
      etiqueta,
    });

    // Marca coleta como tendo item (para não duplicar dentro do mesmo lote)
    coletasComItens.add(coletaId);

    created++;
    if (created <= 20) {
      console.log(`  ✓ NF ${nfNorm} | "${parsed.nome}" → ${result.produto.code} (score ${result.score}) | qty ${parsed.qty}`);
    } else if (created === 21) {
      console.log('  ... (exibindo apenas primeiros 20)');
    }

    // Flush batch
    if (!DRY_RUN && batch.length >= batchSize) {
      await prisma.itemColetado.createMany({ data: batch, skipDuplicates: true });
      batch.length = 0;
    }
  }

  // Flush restante
  if (!DRY_RUN && batch.length > 0) {
    await prisma.itemColetado.createMany({ data: batch, skipDuplicates: true });
  }

  console.log('\n=== RESULTADO ===');
  console.log(`Total de linhas lidas:      ${totalRows}`);
  console.log(`Itens criados:              ${created}`);
  console.log(`Sem NF no banco:            ${skippedNoNF}`);
  console.log(`Coleta já tinha itens:      ${skippedDup}`);
  console.log(`Sem item na coluna ITEM:    ${skippedNoItem}`);
  console.log(`Produto não encontrado:     ${skippedNoProd}`);

  if (notMatched.size > 0) {
    const top = [...notMatched].slice(0, 30);
    console.log(`\nItens sem match de produto (primeiros 30 de ${notMatched.size}):`);
    top.forEach((n) => console.log(`  ✗ "${n}"`));
  }

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Seriam inseridos: ${created} ItemColetado`);
  } else {
    console.log(`\nConcluído! ${created} registros de ItemColetado inseridos.`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('ERRO:', e.message);
  prisma.$disconnect();
  process.exit(1);
});
