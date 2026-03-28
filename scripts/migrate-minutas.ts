/**
 * migrate-minutas.ts
 * Migra minutas do Excel BKP_MINUTA para o banco de dados.
 * Fontes: GUTA (principal), D. BACKUP 30.11.23, D. BACKUP 15.07.22
 *
 * Uso: npx tsx scripts/migrate-minutas.ts
 */

import { PrismaClient } from '@prisma/client';
import XLSX from 'xlsx';
import path from 'path';

const prisma = new PrismaClient();

const EXCEL_PATH = path.resolve(
  'C:/Users/cirof/Downloads/BKP_MINUTA atual/BKP_MINUTA atual.xlsm',
);

type ParsedMinuta = {
  nf: string;
  cliente: string;
  cidade: string;
  uf: string;
  pedido: string;
  produto: string;
  descricao: string;
  coletador: string;
  qtdVolumes: number;
  peso: number;
  volumes: Array<{ qtd: number; desc: string; medidas: string }>;
  source: string;
};

function parseSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
): ParsedMinuta[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    console.log(`  Sheet "${sheetName}" not found, skipping.`);
    return [];
  }

  const data: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
  });

  const minutas: ParsedMinuta[] = [];
  let current: ParsedMinuta | null = null;
  let inVolumes = false;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || !row.some((v: any) => v !== '')) continue;

    const joined = row.map((v: any) => String(v)).join('|');

    // Detect NF row (start of a new minuta)
    if (
      joined.includes('Nº da NF') ||
      joined.includes('N° da NF') ||
      joined.includes('Nº  da NF')
    ) {
      if (current && current.nf) minutas.push(current);
      current = {
        nf: String(row[2] || '').trim(),
        cliente: '',
        cidade: '',
        uf: '',
        pedido: String(row[4] || '').trim(),
        produto: '',
        descricao: '',
        coletador: '',
        qtdVolumes: 0,
        peso: 0,
        volumes: [],
        source: sheetName,
      };
      inVolumes = false;
      continue;
    }

    if (!current) continue;

    if (joined.includes('Revenda/Cliente')) {
      current.cliente = String(row[2] || '').trim();
    } else if (joined.includes('Cidade') && joined.includes(':')) {
      current.cidade = String(row[2] || '').trim();
      if (row[5]) current.uf = String(row[5]).trim();
    } else if (joined.includes('Produto :') || joined.includes('Produto:')) {
      current.produto = String(row[2] || '').trim();
    } else if (
      joined.includes('Descrição :') ||
      joined.includes('Descrição:') ||
      joined.includes('Descricao :')
    ) {
      current.descricao = String(row[2] || '').trim();
    } else if (joined.includes('Qtde. Volumes') || joined.includes('Qtde.Volumes')) {
      current.qtdVolumes = Number(row[2]) || 0;
    } else if (joined.includes('Quantidade') && joined.includes('Descrição')) {
      inVolumes = true;
    } else if (inVolumes) {
      const qtd = Number(row[1]);
      const desc = String(row[2] || '').trim();
      if (qtd > 0 && desc && desc !== '0') {
        current.volumes.push({ qtd, desc, medidas: '' });
      } else if (qtd === 0 || !desc || desc === '0') {
        inVolumes = false;
      }
    }
  }

  if (current && current.nf) minutas.push(current);

  return minutas;
}

function parseMinutaSheets(
  wb: XLSX.WorkBook,
  sheetName: string,
): ParsedMinuta[] {
  // For MINUTA / M.PEÇAS / MODELO MINUTA sheets which have a different format
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  const data: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
  });

  const minutas: ParsedMinuta[] = [];
  let current: ParsedMinuta | null = null;
  let inVolumes = false;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || !row.some((v: any) => v !== '')) continue;
    const joined = row.map((v: any) => String(v)).join('|');

    if (joined.includes('NOTA FISCAL')) {
      if (current && current.nf) minutas.push(current);
      // NF can be at col 2 or 3
      const nfVal = row[3] || row[2] || '';
      current = {
        nf: String(nfVal).trim(),
        cliente: '',
        cidade: '',
        uf: '',
        pedido: '',
        produto: '',
        descricao: '',
        coletador: '',
        qtdVolumes: Number(row[7] || row[6] || 0),
        peso: 0,
        volumes: [],
        source: sheetName,
      };
      inVolumes = false;
      continue;
    }

    if (!current) continue;

    if (joined.includes('CLIENTE')) {
      current.cliente = String(row[3] || row[2] || '').trim();
    } else if (joined.includes('DESTINO') && joined.includes('CIDADE')) {
      current.cidade = String(row[3] || row[2] || '').trim();
      // UF comes after
      for (let c = 4; c < row.length; c++) {
        const val = String(row[c] || '').trim();
        if (val.length === 2 && /^[A-Z]{2}$/.test(val)) {
          current.uf = val;
          break;
        }
      }
    } else if (joined.includes('PEDIDO') || joined.includes('.PEDIDO')) {
      current.pedido = String(row[3] || row[2] || '').trim();
    } else if (joined.includes('COLETADOR')) {
      current.coletador = String(row[3] || row[2] || '').trim();
    } else if (joined.includes('MARCA')) {
      // Next row has the product
    } else if (joined.includes('QUANT.') || (row[1] && joined.includes('QUANT'))) {
      const qty = Number(row[0] || row[1] || 1);
      current.produto = String(row[3] || row[2] || '').trim();
      current.descricao = String(row[6] || row[5] || row[4] || '').trim();
      current.peso = Number(row[7] || row[8] || 0);
    } else if (joined.includes('QTDE') && joined.includes('MEDIDAS')) {
      inVolumes = true;
    } else if (inVolumes) {
      const qtd = Number(row[0] || row[1] || 0);
      const desc = String(row[2] || row[1] || '').trim();
      const medidas = String(row[4] || row[3] || '').trim();
      if (qtd > 0 && desc && desc !== '0') {
        current.volumes.push({ qtd, desc, medidas });
      } else if (qtd === 0 || !desc || desc === '0') {
        inVolumes = false;
      }
    } else if (joined.includes('VOLUMES')) {
      if (!current.qtdVolumes) {
        current.qtdVolumes = Number(row[3] || row[2] || 0);
      }
    }
  }

  if (current && current.nf) minutas.push(current);

  return minutas;
}

async function main() {
  console.log('Reading Excel file...');
  const wb = XLSX.readFile(EXCEL_PATH, { type: 'file' });
  console.log('Sheets:', wb.SheetNames.join(', '));

  // Parse declaration-style sheets (main data sources)
  console.log('\nParsing GUTA...');
  const guta = parseSheet(wb, 'GUTA');
  console.log(`  Found ${guta.length} minutas`);

  console.log('Parsing D. BACKUP 30.11.23...');
  const bkp1 = parseSheet(wb, 'D. BACKUP 30.11.23');
  console.log(`  Found ${bkp1.length} minutas`);

  console.log('Parsing D. BACKUP 15.07.22...');
  const bkp2 = parseSheet(wb, 'D. BACKUP 15.07.22');
  console.log(`  Found ${bkp2.length} minutas`);

  // Parse minuta-format sheets
  console.log('Parsing MINUTA...');
  const minuta = parseMinutaSheets(wb, 'MINUTA');
  console.log(`  Found ${minuta.length} minutas`);

  console.log('Parsing M.PEÇAS...');
  const mPecas = parseMinutaSheets(wb, 'M.PEÇAS');
  console.log(`  Found ${mPecas.length} minutas`);

  console.log('Parsing MODELO MINUTA...');
  const modelo = parseMinutaSheets(wb, 'MODELO MINUTA');
  console.log(`  Found ${modelo.length} minutas`);

  console.log('Parsing D.PEÇAS...');
  const dPecas = parseSheet(wb, 'D.PEÇAS');
  console.log(`  Found ${dPecas.length} minutas`);

  // Merge all, deduplicating by NF (GUTA takes priority, then bkp1, then bkp2)
  const nfMap = new Map<string, ParsedMinuta>();

  // Add in reverse priority order (later wins)
  for (const m of bkp2) {
    if (m.nf) nfMap.set(m.nf, m);
  }
  for (const m of dPecas) {
    if (m.nf) nfMap.set(m.nf, m);
  }
  for (const m of bkp1) {
    if (m.nf) nfMap.set(m.nf, m);
  }
  for (const m of modelo) {
    if (m.nf) nfMap.set(m.nf, m);
  }
  for (const m of mPecas) {
    if (m.nf) nfMap.set(m.nf, m);
  }
  for (const m of minuta) {
    if (m.nf) nfMap.set(m.nf, m);
  }
  for (const m of guta) {
    if (m.nf) nfMap.set(m.nf, m);
  }

  const allMinutas = [...nfMap.values()];
  console.log(`\nTotal unique minutas (by NF): ${allMinutas.length}`);

  // Check existing minutas in DB to avoid duplicates
  const existing = await prisma.minutaConferencia.findMany({
    select: { nfNumero: true },
  });
  const existingNFs = new Set(existing.map((e) => e.nfNumero));
  console.log(`Existing minutas in DB: ${existingNFs.size}`);

  const toInsert = allMinutas.filter((m) => !existingNFs.has(m.nf));
  console.log(`New minutas to insert: ${toInsert.length}`);

  if (toInsert.length === 0) {
    console.log('Nothing to migrate!');
    await prisma.$disconnect();
    return;
  }

  // Insert in batches
  const BATCH_SIZE = 50;
  let inserted = 0;
  let volumeCount = 0;
  let errors = 0;

  for (let b = 0; b < toInsert.length; b += BATCH_SIZE) {
    const batch = toInsert.slice(b, b + BATCH_SIZE);

    for (const m of batch) {
      try {
        const minutaRecord = await prisma.minutaConferencia.create({
          data: {
            nfNumero: m.nf,
            cliente: m.cliente || 'DESCONHECIDO',
            cidade: m.cidade || '',
            uf: m.uf || '',
            pedido: m.pedido || null,
            coletador: m.coletador || null,
            motorista: null,
            numero: null,
            dataColeta: null,
          },
        });

        // Create item (the product)
        if (m.produto || m.descricao || m.volumes.length > 0) {
          const item = await prisma.minutaItem.create({
            data: {
              minutaId: minutaRecord.id,
              produtoCode: m.produto || m.nf,
              produtoDescricao: m.descricao || m.produto || `Produto NF ${m.nf}`,
              quantidade: 1,
              pesoKg: m.peso || null,
              desmontavel: m.volumes.length > 1,
            },
          });

          // Create volumes
          if (m.volumes.length > 0) {
            const totalVols = m.volumes.reduce((s, v) => s + v.qtd, 0);
            let seqNum = 0;

            for (const vol of m.volumes) {
              for (let q = 0; q < vol.qtd; q++) {
                seqNum++;
                await prisma.minutaVolume.create({
                  data: {
                    minutaItemId: item.id,
                    etiqueta: `NF${m.nf}-${String(seqNum).padStart(3, '0')}/${totalVols}`,
                    tipo: 'COMPONENTE',
                    codigo: m.produto || m.nf,
                    descricao: vol.desc,
                    // Parse medidas if available (format: "3.400 X 1.150 X 610")
                    ...(vol.medidas ? parseMedidas(vol.medidas) : {}),
                  },
                });
                volumeCount++;
              }
            }
          }
        }

        inserted++;
      } catch (e: any) {
        errors++;
        if (errors <= 5) {
          console.error(`  Error inserting NF ${m.nf}: ${e?.message}`);
        }
      }
    }

    const pct = Math.round(((b + batch.length) / toInsert.length) * 100);
    process.stdout.write(
      `\r  Progress: ${inserted}/${toInsert.length} (${pct}%) - Volumes: ${volumeCount} - Errors: ${errors}`,
    );
  }

  console.log(
    `\n\nMigration complete!`,
  );
  console.log(`  Minutas inserted: ${inserted}`);
  console.log(`  Volumes created: ${volumeCount}`);
  console.log(`  Errors: ${errors}`);

  await prisma.$disconnect();
}

function parseMedidas(medidas: string): {
  comprimentoCm?: number;
  larguraCm?: number;
  alturaCm?: number;
} {
  if (!medidas) return {};

  // Format: "3.400 X 1.150 X 610" or "600 X 16"
  const clean = medidas
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .toUpperCase();
  const parts = clean.split(/\s*X\s*/);

  if (parts.length >= 3) {
    const comp = Number(parts[0]) / 10; // mm to cm
    const larg = Number(parts[1]) / 10;
    const alt = Number(parts[2]) / 10;
    return {
      comprimentoCm: Number.isFinite(comp) ? comp : undefined,
      larguraCm: Number.isFinite(larg) ? larg : undefined,
      alturaCm: Number.isFinite(alt) ? alt : undefined,
    };
  } else if (parts.length === 2) {
    const comp = Number(parts[0]) / 10;
    const larg = Number(parts[1]) / 10;
    return {
      comprimentoCm: Number.isFinite(comp) ? comp : undefined,
      larguraCm: Number.isFinite(larg) ? larg : undefined,
    };
  }

  return {};
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
