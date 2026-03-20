/**
 * Script de migração: importa dados da planilha E MERCADORIAS para o banco.
 *
 * Uso:  npx tsx scripts/migrate-planilha.ts
 *
 * O que faz:
 *  1. Lê a sheet "2017" da planilha BKP_E MERCADORIAS.xlsx
 *  2. Cria os Clientes únicos (razao = nome da planilha, cidade/uf da primeira ocorrência)
 *  3. Cria as Coletas vinculadas aos clientes
 *
 * IMPORTANTE: roda com --dry-run para testar antes (padrão é dry-run)
 *             passe --execute para gravar no banco de verdade
 */

import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import path from 'path';

const DRY_RUN = !process.argv.includes('--execute');

const XLSX_PATH = path.resolve('C:/Users/cirof/Downloads/BKP_E MERCADORIAS.xlsx');
const SHEET_NAME = '2017';

// Excel serial date to JS Date
function excelDateToJs(serial: number): Date | null {
  if (!serial || !Number.isFinite(serial) || serial < 1000) return null;
  // Excel epoch is 1900-01-01 but off by 1 due to Lotus 123 bug
  const epoch = new Date(1900, 0, 1);
  const d = new Date(epoch.getTime() + (serial - 2) * 86400000);
  return isNaN(d.getTime()) ? null : d;
}

interface RawRow {
  nf: string;
  cliente: string;
  cidade: string;
  uf: string;
  item: string;
  peso: number;
  valor: number;
  coleta: number; // excel serial date
  coletador: string;
  status: string;
  leadTime: number;
  embarque: number; // excel serial date
}

function parseRows(): RawRow[] {
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) throw new Error(`Sheet "${SHEET_NAME}" not found`);

  const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const rows: RawRow[] = [];

  for (let i = 5; i < data.length; i++) {
    const r: any = data[i];
    const nf = String(r['__EMPTY_1'] || '').trim();
    const cliente = String(r['__EMPTY_2'] || '').trim();
    if (!nf || !cliente || nf === 'Nota Fiscal') continue;

    const cidade = String(r['__EMPTY_3'] || '').trim();
    const uf = String(r['__EMPTY_4'] || '').trim().toUpperCase();
    const item = String(r['__EMPTY_5'] || '').trim();
    const peso = Number(r['__EMPTY_6']) || 0;
    const valor = Number(r['119080415.9']) || 0;
    const coleta = Number(r['__EMPTY_7']) || 0;
    const coletador = String(r['__EMPTY_8'] || '').trim();
    const status = String(r['__EMPTY_11'] || '').trim();
    const leadTime = Number(r['__EMPTY_12']) || 0;
    const embarque = Number(r['__EMPTY_13']) || 0;

    if (!/^[A-Z]{2}$/.test(uf)) continue; // skip rows with bad UF

    rows.push({ nf, cliente, cidade, uf, item, peso, valor, coleta, coletador, status, leadTime, embarque });
  }

  return rows;
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (use --execute para gravar) ===' : '=== EXECUTANDO MIGRAÇÃO ===');
  console.log();

  const rows = parseRows();
  console.log(`Linhas válidas na planilha: ${rows.length}`);

  // ----------- 1. Clientes únicos -----------
  const clienteMap = new Map<string, { razao: string; cidade: string; uf: string }>();
  for (const r of rows) {
    const key = r.cliente.toUpperCase();
    if (!clienteMap.has(key)) {
      clienteMap.set(key, { razao: r.cliente, cidade: r.cidade, uf: r.uf });
    }
  }

  console.log(`Clientes únicos: ${clienteMap.size}`);

  const prisma = new PrismaClient();

  try {
    // ----------- 2. Criar/buscar clientes -----------
    const clienteIdMap = new Map<string, string>(); // KEY (upper) -> db id

    // Busca clientes já existentes
    const existing = await prisma.cliente.findMany({ select: { id: true, razao: true } });
    for (const c of existing) {
      clienteIdMap.set(c.razao.toUpperCase(), c.id);
    }

    let clientesCriados = 0;
    for (const [key, val] of clienteMap) {
      if (clienteIdMap.has(key)) continue; // já existe

      if (DRY_RUN) {
        clienteIdMap.set(key, `DRY-${clientesCriados}`);
      } else {
        const created = await prisma.cliente.create({
          data: {
            razao: val.razao,
            cidade: val.cidade,
            uf: val.uf,
          },
          select: { id: true },
        });
        clienteIdMap.set(key, created.id);
      }
      clientesCriados++;
    }

    console.log(`Clientes criados: ${clientesCriados} (já existiam: ${clienteMap.size - clientesCriados})`);

    // ----------- 3. Criar coletas -----------
    let coletasCriadas = 0;
    let coletasSkipped = 0;

    // Busca NFs já existentes para evitar duplicatas
    const existingNfs = new Set<string>();
    const existingColetas = await prisma.coleta.findMany({ select: { nf: true } });
    for (const c of existingColetas) {
      existingNfs.add(c.nf);
    }

    const batchSize = 100;
    const coletaBatch: any[] = [];

    for (const r of rows) {
      // Verifica se já existe uma coleta com esta NF
      if (existingNfs.has(String(r.nf))) {
        coletasSkipped++;
        continue;
      }

      const clienteKey = r.cliente.toUpperCase();
      const clienteId = clienteIdMap.get(clienteKey);
      if (!clienteId) {
        console.warn(`  WARN: cliente não encontrado para "${r.cliente}"`);
        coletasSkipped++;
        continue;
      }

      const dataColeta = excelDateToJs(r.coleta);
      const dataEmbarque = excelDateToJs(r.embarque);

      // Determina status baseado nos dados
      let status: 'EM_PATIO' | 'CARREGADA' | 'EM_TRANSITO' | 'ENTREGUE' = 'ENTREGUE';
      if (!dataEmbarque) {
        status = 'EM_PATIO';
      }

      coletaBatch.push({
        nf: String(r.nf),
        clienteId,
        cidade: r.cidade,
        uf: r.uf,
        valorFrete: r.valor,
        pesoTotalKg: r.peso,
        coletador: r.coletador || null,
        status,
        entradaPatioAt: dataColeta || new Date(),
        embarqueAt: dataEmbarque || null,
        fimPatioAt: dataEmbarque || null,
      });

      existingNfs.add(String(r.nf)); // evita duplicatas dentro do mesmo batch
    }

    console.log(`Coletas a criar: ${coletaBatch.length} (skipped duplicatas: ${coletasSkipped})`);

    if (!DRY_RUN && coletaBatch.length > 0) {
      // Insere em batches
      for (let i = 0; i < coletaBatch.length; i += batchSize) {
        const batch = coletaBatch.slice(i, i + batchSize);
        await prisma.coleta.createMany({ data: batch as any });
        coletasCriadas += batch.length;
        process.stdout.write(`\r  Progresso: ${coletasCriadas}/${coletaBatch.length}`);
      }
      console.log();
    } else if (DRY_RUN) {
      coletasCriadas = coletaBatch.length;
    }

    console.log();
    console.log('=== RESUMO ===');
    console.log(`  Clientes criados: ${clientesCriados}`);
    console.log(`  Coletas criadas: ${coletasCriadas}`);
    console.log(`  Coletas ignoradas (duplicata NF): ${coletasSkipped}`);

    if (DRY_RUN) {
      console.log();
      console.log('>>> Nenhum dado foi gravado (dry-run). Para gravar:');
      console.log('>>> npx tsx scripts/migrate-planilha.ts --execute');
    } else {
      console.log();
      console.log('Migração concluída com sucesso!');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('ERRO:', e);
  process.exit(1);
});
