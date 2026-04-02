/**
 * Data enrichment script v2 - FAST batch operations
 * Focuses on actual gaps:
 * 1. Componentes from BANCO DE DADOS (batch upsert)
 * 2. MinutaConferencia: valorNF, pesoTotalKg, coletador from ENT sheet
 * 3. MinutaItem: peso/dimensions from matched Produto
 * 4. MinutaVolume: peso from parent MinutaItem
 */

import XLSX from 'xlsx';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normCode(code) {
  return String(code || '').trim().toUpperCase();
}

function parseDimension(str) {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim().replace(/\s+/g, ' ');
  const match = s.match(/^([\d.,]+)\s*[xX]\s*([\d.,]+)\s*[xX]\s*([\d.,]+)$/);
  if (!match) return null;

  function parseNum(v) {
    let n = v.trim();
    if (n.includes('.') && n.includes(',')) {
      n = n.replace(/\./g, '').replace(',', '.');
    } else if (n.includes(',')) {
      n = n.replace(',', '');
    } else if (n.includes('.') && /^\d+\.\d{3}$/.test(n)) {
      n = n.replace('.', '');
    }
    return parseFloat(n) || 0;
  }

  const comp = parseNum(match[1]);
  const larg = parseNum(match[2]);
  const alt = parseNum(match[3]);
  if (comp <= 0 || larg <= 0 || alt <= 0) return null;

  return {
    comprimentoCm: Math.round(comp / 10 * 10) / 10,
    larguraCm: Math.round(larg / 10 * 10) / 10,
    alturaCm: Math.round(alt / 10 * 10) / 10,
  };
}

// ===== Step 1: Componentes from BANCO DE DADOS =====
async function enrichComponentes() {
  console.log('\n=== Step 1: Componentes from BANCO DE DADOS ===');

  const f = path.join('C:', 'Users', 'cirof', 'Downloads', 'BKP_MINUTA atual', 'BKP_MINUTA atual.xlsm');
  const wb = XLSX.readFile(f);
  const sheet = wb.Sheets['BANCO DE DADOS'];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Build map: produtoCode → [{ qty, name, dimension }]
  const compMap = new Map();
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[1] || !String(row[1]).trim()) continue;
    const prodCode = normCode(row[1]);
    const components = [];
    for (let g = 0; g < 18; g++) {
      const baseCol = 3 + g * 3;
      const qty = row[baseCol];
      const itemName = row[baseCol + 1];
      const medida = row[baseCol + 2];
      if (!itemName || !String(itemName).trim()) continue;
      components.push({
        quantidade: typeof qty === 'number' ? qty : 1,
        nome: String(itemName).trim(),
        medida: medida ? String(medida).trim() : null,
      });
    }
    if (components.length > 0) compMap.set(prodCode, components);
  }
  console.log(`  Excel: ${compMap.size} products with components`);

  // Get all Produto IDs
  const produtos = await prisma.produto.findMany({ select: { id: true, code: true } });
  const prodByCode = new Map(produtos.map(p => [normCode(p.code), p.id]));

  // Get existing componentes to avoid duplicates
  const existing = await prisma.componente.findMany({ select: { produtoId: true, codigo: true } });
  const existingSet = new Set(existing.map(c => c.produtoId + '::' + c.codigo));

  const toCreate = [];
  let dimUpdates = 0;

  for (const [prodCode, components] of compMap) {
    const prodId = prodByCode.get(prodCode);
    if (!prodId) continue;

    for (const comp of components) {
      const codigo = comp.nome.replace(/\s+/g, '-').toUpperCase().slice(0, 50);
      const key = prodId + '::' + codigo;
      if (existingSet.has(key)) continue;
      existingSet.add(key); // avoid duplicates within same batch

      const dims = comp.medida ? parseDimension(comp.medida) : null;
      toCreate.push({
        produtoId: prodId,
        codigo,
        nome: comp.nome,
        quantidade: comp.quantidade,
        ...(dims ? {
          comprimentoCm: dims.comprimentoCm,
          larguraCm: dims.larguraCm,
          alturaCm: dims.alturaCm,
          volumeM3: Math.round(dims.comprimentoCm * dims.larguraCm * dims.alturaCm / 1e6 * 1000) / 1000,
        } : {}),
      });
    }
  }

  console.log(`  Creating ${toCreate.length} new Componente records...`);
  const chunkSize = 500;
  for (let i = 0; i < toCreate.length; i += chunkSize) {
    await prisma.componente.createMany({ data: toCreate.slice(i, i + chunkSize), skipDuplicates: true });
    if (i % 2000 === 0 && i > 0) console.log(`  ... ${i}/${toCreate.length}`);
  }
  console.log(`  Done: ${toCreate.length} componentes created`);

  // Update Produto dimensions from first component
  console.log('  Updating Produto dimensions from first component...');
  const prodsNeedDim = await prisma.produto.findMany({
    where: { comprimentoCm: null },
    select: { id: true, code: true },
  });

  for (const prod of prodsNeedDim) {
    const components = compMap.get(normCode(prod.code));
    if (!components || !components[0]?.medida) continue;
    const dims = parseDimension(components[0].medida);
    if (!dims) continue;
    await prisma.produto.update({ where: { id: prod.id }, data: dims });
    dimUpdates++;
  }
  console.log(`  Updated ${dimUpdates} Produto dimension records`);
}

// ===== Step 2: MinutaConferencia from ENT sheet =====
async function enrichMinutas() {
  console.log('\n=== Step 2: MinutaConferencia from ENT sheet ===');

  const f = path.join('C:', 'Users', 'cirof', 'Downloads', 'BKP_FORMAÇÃO DE CARGA - Copia.xlsm');
  const wb = XLSX.readFile(f);
  const sheet = wb.Sheets['ENT'];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const nfMap = new Map();
  for (let i = 6; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[2]) continue;
    const nf = String(row[2]).trim();
    if (!nf || !/^\d+$/.test(nf)) continue;

    const peso = typeof row[7] === 'number' ? row[7] : null;
    const valorNF = typeof row[8] === 'number' ? row[8] : null;
    const coletador = row[10] ? String(row[10]).trim() : null;
    const coleta = row[9];
    let dataColeta = null;
    if (typeof coleta === 'number' && coleta > 30000) {
      dataColeta = new Date((coleta - 25569) * 86400 * 1000);
    }

    if (!nfMap.has(nf)) {
      nfMap.set(nf, { peso, valorNF, coletador, dataColeta });
    }
  }
  console.log(`  ENT sheet: ${nfMap.size} unique NFs`);

  // Use raw SQL for massive batch update
  let updated = 0;
  const entries = Array.from(nfMap.entries());
  const batchSize = 200;

  for (let b = 0; b < entries.length; b += batchSize) {
    const batch = entries.slice(b, b + batchSize);
    const ops = [];

    for (const [nf, entry] of batch) {
      const setClauses = [];
      const params = [];
      let paramIdx = 1;

      if (entry.valorNF != null) {
        setClauses.push(`"valorNF" = $${paramIdx++}`);
        params.push(entry.valorNF);
      }
      if (entry.peso != null) {
        setClauses.push(`"pesoTotalKg" = $${paramIdx++}`);
        params.push(entry.peso);
      }
      if (entry.coletador) {
        setClauses.push(`"coletador" = $${paramIdx++}`);
        params.push(entry.coletador);
      }
      if (entry.dataColeta) {
        setClauses.push(`"dataColeta" = $${paramIdx++}`);
        params.push(entry.dataColeta);
      }

      if (setClauses.length === 0) continue;

      // Use Prisma updateMany for batch updates by NF
      const upd = {};
      if (entry.valorNF != null) upd.valorNF = entry.valorNF;
      if (entry.peso != null) upd.pesoTotalKg = entry.peso;
      if (entry.coletador) upd.coletador = entry.coletador;
      if (entry.dataColeta) upd.dataColeta = entry.dataColeta;

      ops.push(prisma.minutaConferencia.updateMany({
        where: {
          nfNumero: nf,
          OR: [
            { valorNF: null },
            { pesoTotalKg: null },
            { coletador: null },
            { dataColeta: null },
          ],
        },
        data: upd,
      }));
    }

    if (ops.length > 0) {
      const results = await prisma.$transaction(ops);
      updated += results.reduce((s, r) => s + r.count, 0);
    }

    if (b % 2000 === 0 && b > 0) console.log(`  ... ${b}/${entries.length}`);
  }

  console.log(`  Updated ${updated} MinutaConferencia records`);
}

// ===== Step 3: MinutaItem peso from Produto =====
async function enrichMinutaItems() {
  console.log('\n=== Step 3: MinutaItem peso/dimensions from Produto ===');

  // Use SQL for maximum speed: UPDATE MinutaItem SET pesoKg = P.pesoKg * MI.quantidade ...
  const result = await prisma.$executeRaw`
    UPDATE "MinutaItem" mi
    SET
      "pesoKg" = COALESCE(mi."pesoKg", p."pesoKg" * mi."quantidade"),
      "comprimentoCm" = COALESCE(mi."comprimentoCm", p."compCm"),
      "larguraCm" = COALESCE(mi."larguraCm", p."largCm"),
      "alturaCm" = COALESCE(mi."alturaCm", p."altCm"),
      "areaM2" = COALESCE(mi."areaM2", p."areaM2",
        CASE WHEN p."compCm" IS NOT NULL AND p."largCm" IS NOT NULL
          THEN ROUND((p."compCm" * p."largCm" / 10000.0)::numeric, 3)::float
          ELSE NULL END),
      "volumeM3" = COALESCE(mi."volumeM3",
        CASE WHEN p."compCm" IS NOT NULL AND p."largCm" IS NOT NULL AND p."altCm" IS NOT NULL
          THEN ROUND((p."compCm" * p."largCm" * p."altCm" / 1000000.0 * mi."quantidade")::numeric, 3)::float
          ELSE NULL END)
    FROM "Produto" p
    WHERE UPPER(mi."produtoCode") = UPPER(p."codigo")
    AND (mi."pesoKg" IS NULL OR mi."comprimentoCm" IS NULL)
  `;
  console.log(`  Updated ${result} MinutaItem records via SQL`);
}

// ===== Step 4: MinutaVolume peso from parent MinutaItem =====
async function enrichMinutaVolumes() {
  console.log('\n=== Step 4: MinutaVolume peso from parent MinutaItem ===');

  // First: distribute parent MinutaItem.pesoKg across its volumes
  const result = await prisma.$executeRaw`
    UPDATE "MinutaVolume" mv
    SET "pesoKg" = sub.peso_per_vol
    FROM (
      SELECT mv2.id,
        ROUND((mi."pesoKg" / NULLIF(cnt.vol_count, 0))::numeric, 1)::float as peso_per_vol
      FROM "MinutaVolume" mv2
      INNER JOIN "MinutaItem" mi ON mi.id = mv2."minutaItemId"
      INNER JOIN (
        SELECT "minutaItemId", count(*)::int as vol_count
        FROM "MinutaVolume"
        GROUP BY "minutaItemId"
      ) cnt ON cnt."minutaItemId" = mi.id
      WHERE mv2."pesoKg" IS NULL
      AND mi."pesoKg" IS NOT NULL
    ) sub
    WHERE mv.id = sub.id
  `;
  console.log(`  Distributed peso to ${result} MinutaVolume records`);

  // Second: copy dimensions from parent MinutaItem
  const result2 = await prisma.$executeRaw`
    UPDATE "MinutaVolume" mv
    SET
      "comprimentoCm" = COALESCE(mv."comprimentoCm", mi."comprimentoCm"),
      "larguraCm" = COALESCE(mv."larguraCm", mi."larguraCm"),
      "alturaCm" = COALESCE(mv."alturaCm", mi."alturaCm"),
      "areaM2" = COALESCE(mv."areaM2", mi."areaM2"),
      "volumeM3" = COALESCE(mv."volumeM3", mi."volumeM3")
    FROM "MinutaItem" mi
    WHERE mi.id = mv."minutaItemId"
    AND (mv."comprimentoCm" IS NULL OR mv."larguraCm" IS NULL)
    AND (mi."comprimentoCm" IS NOT NULL OR mi."larguraCm" IS NOT NULL)
  `;
  console.log(`  Copied dimensions to ${result2} MinutaVolume records`);
}

// ===== Main =====
async function main() {
  console.log('Starting data enrichment v2 (batch mode)...');

  await enrichComponentes();
  await enrichMinutas();
  await enrichMinutaItems();
  await enrichMinutaVolumes();

  // Final stats
  console.log('\n=== Final Stats ===');
  const stats = await Promise.all([
    prisma.$queryRaw`SELECT count(*)::int as total, count(CASE WHEN "pesoKg" IS NOT NULL THEN 1 END)::int as com_peso, count(CASE WHEN "fabricante" IS NOT NULL THEN 1 END)::int as com_fab, count(CASE WHEN "compCm" IS NOT NULL THEN 1 END)::int as com_dim FROM "Produto"`,
    prisma.$queryRaw`SELECT count(*)::int as total, count(CASE WHEN "pesoKg" IS NOT NULL THEN 1 END)::int as com_peso, count(CASE WHEN "compCm" IS NOT NULL THEN 1 END)::int as com_dim FROM "Componente"`,
    prisma.$queryRaw`SELECT count(*)::int as total, count(CASE WHEN "pesoKg" IS NOT NULL THEN 1 END)::int as com_peso, count(CASE WHEN "comprimentoCm" IS NOT NULL THEN 1 END)::int as com_dim, count(CASE WHEN "volumeM3" IS NOT NULL THEN 1 END)::int as com_vol FROM "MinutaItem"`,
    prisma.$queryRaw`SELECT count(*)::int as total, count(CASE WHEN "pesoKg" IS NOT NULL THEN 1 END)::int as com_peso, count(CASE WHEN "comprimentoCm" IS NOT NULL THEN 1 END)::int as com_dim FROM "MinutaVolume"`,
    prisma.$queryRaw`SELECT count(*)::int as total, count(CASE WHEN "valorNF" IS NOT NULL THEN 1 END)::int as com_valor, count(CASE WHEN "pesoTotalKg" IS NOT NULL THEN 1 END)::int as com_peso, count(CASE WHEN "coletador" IS NOT NULL THEN 1 END)::int as com_col FROM "MinutaConferencia"`,
  ]);

  console.log('Produto:', stats[0][0]);
  console.log('Componente:', stats[1][0]);
  console.log('MinutaItem:', stats[2][0]);
  console.log('MinutaVolume:', stats[3][0]);
  console.log('MinutaConferencia:', stats[4][0]);

  await prisma.$disconnect();
  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
