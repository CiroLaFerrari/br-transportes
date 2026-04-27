/**
 * migrate-dimensions.js
 *
 * Lê a aba "BANCO DE DADOS" do BKP_MINUTA atual.xlsm, extrai COD + MEDIDA,
 * converte mm → cm e atualiza os produtos no banco que ainda não têm dimensões.
 *
 * Estratégia de match (em ordem de prioridade):
 *   1. Código normalizado (exato)
 *   2. Código sem separadores (ignora hífens/pontos)
 *   3. Descrição normalizada (todas palavras ≥ 3 chars presentes)
 *
 * Uso: node scripts/migrate-dimensions.js [--dry-run]
 */

const path = require('path');
const xlsx = require('xlsx');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

// ── Parser de MEDIDA: "1.700 X 2.600 X 1.500" → { comp, larg, alt } em cm ──
// Suporta: separador X/x, espaços como separador extra, vírgulas/pontos como milhar
function parseDim(raw) {
  if (!raw) return null;
  const clean = String(raw).trim();

  // Normaliza separadores: X, x, ou múltiplos espaços entre números
  // Ex: "510 300" (sem X) → "510 X 300"
  const normalized = clean
    .replace(/\s+X\s+/gi, 'X')
    .replace(/(\d)\s+(\d)/g, '$1 X $2'); // "510 300" → "510 X 300"

  const parts = normalized.split(/\s*[Xx×]\s*/);
  if (parts.length < 2) return null;

  const vals = parts
    .map((p) => {
      const digits = p.replace(/[^0-9]/g, '');
      if (!digits || digits.length === 0) return null;
      const n = parseInt(digits, 10);
      if (!Number.isFinite(n) || n <= 0) return null;
      return n / 10; // mm → cm
    })
    .filter((v) => v !== null && v > 0);

  if (vals.length < 2) return null;
  return {
    comprimentoCm: vals[0],
    larguraCm:     vals[1],
    alturaCm:      vals[2] ?? null,
  };
}

// ── Normalização de código ────────────────────────────────────────────────
function normCode(s) {
  return String(s ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s\-_.\/,]+/g, '-')
    .replace(/[^A-Z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Código sem separadores para match mais amplo
function stripCode(s) {
  return normCode(s).replace(/-/g, '');
}

// Normalização de descrição
function normDesc(s) {
  return String(s ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Score de match por descrição (palavras ≥ 3 chars)
function descScore(dbDesc, xlsxDesc) {
  const db = normDesc(dbDesc).split(' ').filter((w) => w.length >= 3);
  const xl = normDesc(xlsxDesc).split(' ').filter((w) => w.length >= 3);
  if (db.length === 0 || xl.length === 0) return 0;
  const hits = db.filter((w) => xl.includes(w)).length;
  return hits / Math.max(db.length, xl.length);
}

async function main() {
  console.log('=== MIGRAÇÃO DE DIMENSÕES ===');
  console.log(DRY_RUN ? '[DRY RUN — nenhuma alteração será salva]\n' : '[MODO REAL — vai salvar no banco]\n');

  // 1. Ler Excel BANCO DE DADOS
  const xlsxPath = path.join(__dirname, '..', 'BKP_MINUTA atual.xlsm');
  const wb = xlsx.readFile(xlsxPath);
  const ws = wb.Sheets['BANCO DE DADOS'];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Extrair COD, DESCRIÇÃO e primeira MEDIDA (col 1, 2, 5)
  const entries = []; // { cod, desc, medida, parsed, normCod, stripCod }
  const normCodeMap  = new Map(); // normCode  → entry (first wins)
  const stripCodeMap = new Map(); // stripCode → entry
  let skippedBadDim = 0;

  for (let i = 3; i < rows.length; i++) {
    const cod  = String(rows[i][1] ?? '').trim();
    const desc = String(rows[i][2] ?? '').trim();
    const med  = String(rows[i][5] ?? '').trim();
    if (!cod || !med) continue;

    const parsed = parseDim(med);
    if (!parsed) { skippedBadDim++; continue; }

    const nc = normCode(cod);
    const sc = stripCode(cod);
    const entry = { cod, desc, medida: med, parsed, nc, sc };
    entries.push(entry);
    if (!normCodeMap.has(nc))  normCodeMap.set(nc, entry);
    if (!stripCodeMap.has(sc)) stripCodeMap.set(sc, entry);
  }

  console.log(`Excel: ${entries.length} produtos com dimensão válida (${skippedBadDim} com medida inválida ignorados)`);

  // 2. Produtos sem dimensões no banco
  const produtos = await prisma.produto.findMany({
    where: { OR: [{ comprimentoCm: null }, { larguraCm: null }, { alturaCm: null }] },
    select: { id: true, code: true, descricao: true },
  });
  console.log(`Banco: ${produtos.length} produtos sem dimensões completas\n`);

  const SCORE_THRESHOLD = 0.55; // mínimo 55% das palavras em comum para match por descrição

  let byCode = 0, byStrip = 0, byDesc = 0, noMatch = 0;
  let updated = 0;

  for (const prod of produtos) {
    const nc = normCode(prod.code);
    const sc = stripCode(prod.code);

    let entry = normCodeMap.get(nc);
    let matchType = 'code';

    if (!entry) {
      entry = stripCodeMap.get(sc);
      matchType = 'strip';
    }

    if (!entry) {
      // Tentar match por descrição
      let bestScore = 0;
      let bestEntry = null;
      for (const e of entries) {
        const s = descScore(prod.descricao, e.desc || e.cod);
        if (s > bestScore) { bestScore = s; bestEntry = e; }
      }
      if (bestScore >= SCORE_THRESHOLD) {
        entry = bestEntry;
        matchType = `desc(${Math.round(bestScore * 100)}%)`;
      }
    }

    if (!entry) { noMatch++; continue; }

    if (matchType === 'code') byCode++;
    else if (matchType === 'strip') byStrip++;
    else byDesc++;

    const { comprimentoCm, larguraCm, alturaCm } = entry.parsed;

    if (!DRY_RUN) {
      await prisma.produto.update({
        where: { id: prod.id },
        data: {
          comprimentoCm: comprimentoCm ?? undefined,
          larguraCm:     larguraCm     ?? undefined,
          alturaCm:      alturaCm      ?? undefined,
        },
      });
    }

    updated++;
    if (updated <= 30) {
      console.log(`  ✓ [${matchType}] "${prod.code}" → ${comprimentoCm}×${larguraCm}×${alturaCm ?? '?'} cm  (Excel: "${entry.medida}")`);
    } else if (updated === 31) {
      console.log('  ... (exibindo apenas primeiros 30)');
    }
  }

  console.log('\n=== RESULTADO ===');
  console.log(`Total sem dimensões:    ${produtos.length}`);
  console.log(`Match por código exato: ${byCode}`);
  console.log(`Match por código strip: ${byStrip}`);
  console.log(`Match por descrição:    ${byDesc}`);
  console.log(`Sem match nenhum:       ${noMatch}`);
  console.log(DRY_RUN ? `[DRY RUN] Atualizariam: ${updated}` : `Atualizados: ${updated}`);

  if (noMatch > 0 && noMatch <= 30) {
    const noBatch = produtos.filter((p) => {
      const nc = normCode(p.code);
      const sc = stripCode(p.code);
      if (normCodeMap.has(nc) || stripCodeMap.has(sc)) return false;
      for (const e of entries) {
        if (descScore(p.descricao, e.desc || e.cod) >= SCORE_THRESHOLD) return false;
      }
      return true;
    });
    console.log('\nSem match (amostra):');
    noBatch.slice(0, 20).forEach((p) => console.log(`  ✗ "${p.code}" | "${p.descricao?.slice(0, 40)}"`));
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('ERRO:', e.message);
  prisma.$disconnect();
  process.exit(1);
});
