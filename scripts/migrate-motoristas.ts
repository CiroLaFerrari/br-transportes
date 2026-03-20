/**
 * Script de migração: importa motoristas (coletadores) da planilha E MERCADORIAS para o banco.
 *
 * Uso:  npx tsx scripts/migrate-motoristas.ts
 *
 * O que faz:
 *  1. Lê a sheet "2017" da planilha BKP_E MERCADORIAS.xlsx
 *  2. Extrai coletadores únicos da coluna __EMPTY_8 (a partir da linha 5)
 *  3. Normaliza nomes (corrige typos, remove entradas que não são pessoas)
 *  4. Importa no modelo Motorista via Prisma, ignorando duplicatas
 */

const XLSX = require('xlsx');
import { PrismaClient } from '@prisma/client';
import path from 'path';

const prisma = new PrismaClient();

const XLSX_PATH = path.resolve('C:/Users/cirof/Downloads/BKP_E MERCADORIAS.xlsx');
const SHEET_NAME = '2017';

// Map of typos/variants to their corrected name
const NAME_CORRECTIONS: Record<string, string> = {
  'EDUADO': 'EDUARDO',
  'EDUADRO': 'EDUARDO',
  'EDURADO': 'EDUARDO',
  'MSRCOS L': 'MARCOS L',
  'HUMEBRTO': 'HUMBERTO',
};

// Names to skip (not real people)
const SKIP_NAMES = new Set([
  'ENTERGA',
  'ENTREGA',
  'ENTREGAS',
  'RESERVI',
  'REVERSI',
  'AGG',
]);

function normalizeName(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;

  let name = raw.trim().toUpperCase();

  // Skip empty
  if (!name) return null;

  // Skip non-person entries
  if (SKIP_NAMES.has(name)) return null;

  // Apply typo corrections
  if (NAME_CORRECTIONS[name]) {
    name = NAME_CORRECTIONS[name];
  }

  return name;
}

async function main() {
  console.log('=== Migração de Motoristas ===\n');
  console.log(`Lendo planilha: ${XLSX_PATH}`);

  const workbook = XLSX.readFile(XLSX_PATH);
  const sheet = workbook.Sheets[SHEET_NAME];

  if (!sheet) {
    console.error(`Sheet "${SHEET_NAME}" não encontrada!`);
    process.exit(1);
  }

  // Convert to JSON (header row produces __EMPTY_N keys)
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet);

  console.log(`Total de linhas na sheet: ${rows.length}`);

  // Extract unique coletadores from rows starting at row 5
  // (sheet_to_json skips the header, so index 3 = row 5 in Excel)
  const uniqueNames = new Set<string>();
  let validRowCount = 0;

  for (let i = 3; i < rows.length; i++) {
    const row = rows[i];
    const nf = row['__EMPTY_1'];
    const cliente = row['__EMPTY_2'];
    const coletador = row['__EMPTY_8'];

    // Filter: must have valid NF and cliente
    if (!nf || !cliente) continue;
    validRowCount++;

    const normalized = normalizeName(String(coletador || ''));
    if (normalized) {
      uniqueNames.add(normalized);
    }
  }

  console.log(`Linhas válidas (com NF e cliente): ${validRowCount}`);
  console.log(`Coletadores únicos encontrados: ${uniqueNames.size}`);
  console.log(`Nomes: ${[...uniqueNames].sort().join(', ')}\n`);

  // Import into Motorista model
  let created = 0;
  let skipped = 0;

  for (const nome of [...uniqueNames].sort()) {
    // Check if already exists
    const existing = await prisma.motorista.findFirst({
      where: { nome },
    });

    if (existing) {
      console.log(`  SKIP (já existe): ${nome}`);
      skipped++;
      continue;
    }

    await prisma.motorista.create({
      data: {
        nome,
        disponibilidade: true,
      },
    });

    console.log(`  CRIADO: ${nome}`);
    created++;
  }

  console.log(`\n=== Resultado ===`);
  console.log(`Criados: ${created}`);
  console.log(`Ignorados (duplicatas): ${skipped}`);
  console.log(`Total motoristas no banco: ${await prisma.motorista.count()}`);
}

main()
  .catch((e) => {
    console.error('Erro na migração:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
