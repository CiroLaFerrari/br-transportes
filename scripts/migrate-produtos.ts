/**
 * Migra produtos da planilha E MERCADORIAS para o banco de dados.
 * Normaliza nomes similares e calcula peso medio.
 *
 * Uso: npx tsx scripts/migrate-produtos.ts
 */
import { PrismaClient } from '@prisma/client';
const XLSX = require('xlsx');

const prisma = new PrismaClient();

// Normalizacao de nomes para agrupar variantes
function normalizeName(raw: string): string {
  let n = raw.toUpperCase().trim();
  // Remove pontos e hifens desnecessarios
  n = n.replace(/\./g, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  // Unifica variantes conhecidas
  n = n.replace(/^AM\s+DE\s+DISCO$/i, 'AMARRADO DE DISCO');
  n = n.replace(/^AM\s+DISCO$/i, 'AMARRADO DE DISCO');
  n = n.replace(/^CX\s+DE\s+MADEIRA$/i, 'CAIXA DE MADEIRA');
  n = n.replace(/^CX\s+MADEIRA$/i, 'CAIXA DE MADEIRA');
  n = n.replace(/^CX\s+DE\s+PAPELAO$/i, 'CAIXA DE PAPELAO');
  n = n.replace(/^CX\s+PAPELAO$/i, 'CAIXA DE PAPELAO');
  n = n.replace(/^BARRA\s+12\s*M$/i, 'BARRA 12M');
  n = n.replace(/^MIN\s+500$/i, 'MIN 500');
  n = n.replace(/^MIN\s+1000$/i, 'MIN 1000');
  return n;
}

// Determina tipo de embalagem a partir do nome
function guessEmbalagem(name: string): string | null {
  const u = name.toUpperCase();
  if (u.includes('CX') && u.includes('MADEIRA')) return 'CAIXA_MADEIRA';
  if (u.includes('CX') && u.includes('PAPELAO')) return 'CAIXA_PAPELAO';
  if (u.includes('CAIXA') && u.includes('MADEIRA')) return 'CAIXA_MADEIRA';
  if (u.includes('CAIXA') && u.includes('PAPELAO')) return 'CAIXA_PAPELAO';
  if (u.includes('AM') && u.includes('DISCO')) return 'AMARRADO';
  if (u.includes('AMARRADO')) return 'AMARRADO';
  return null;
}

async function main() {
  const wb = XLSX.readFile('C:/Users/cirof/Downloads/BKP_E MERCADORIAS.xlsx');
  const ws = wb.Sheets['2017'];
  const data: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

  // Agrupa por nome normalizado
  const prodMap = new Map<string, { rawNames: Set<string>; totalPeso: number; totalQty: number }>();

  for (let i = 5; i < data.length; i++) {
    const row = data[i];
    const nf = String(row['__EMPTY_1'] || '').trim();
    const cliente = String(row['__EMPTY_2'] || '').trim();
    const item = String(row['__EMPTY_5'] || '').trim();
    const peso = Number(row['__EMPTY_6'] || 0);
    if (!nf || !cliente || nf === 'Nota Fiscal' || !item) continue;

    const parts = item.split('/').map((s: string) => s.trim());
    for (const part of parts) {
      const m = part.match(/^(\d+)\s+(.+)/);
      let name = part;
      let qty = 1;
      if (m) { qty = parseInt(m[1]); name = m[2].trim(); }

      const normalized = normalizeName(name);
      if (!normalized) continue;

      if (!prodMap.has(normalized)) {
        prodMap.set(normalized, { rawNames: new Set(), totalPeso: 0, totalQty: 0 });
      }
      const p = prodMap.get(normalized)!;
      p.rawNames.add(name);
      p.totalQty += qty;
      p.totalPeso += peso; // peso da NF inteira (aproximacao)
    }
  }

  console.log(`Produtos unicos (normalizados): ${prodMap.size}`);

  // Filtra apenas produtos com >= 2 ocorrencias (ignora itens one-off muito especificos)
  const entries = [...prodMap.entries()].filter(([, v]) => v.totalQty >= 2);
  console.log(`Produtos com >= 2 ocorrencias: ${entries.length}`);

  let created = 0;
  let skipped = 0;

  for (const [normalized, info] of entries) {
    const code = normalized.replace(/\s+/g, '-').substring(0, 50);

    // Verifica se ja existe
    const existing = await prisma.produto.findUnique({ where: { code } });
    if (existing) {
      skipped++;
      continue;
    }

    const avgPeso = info.totalQty > 0 ? Math.round(info.totalPeso / info.totalQty) : undefined;
    const embalagem = guessEmbalagem(normalized);

    try {
      await prisma.produto.create({
        data: {
          code,
          descricao: normalized,
          pesoKg: avgPeso || undefined,
          tipoEmbalagem: embalagem as any || undefined,
          embalado: embalagem !== null,
          tipoCodigo: 'FORNECEDOR',
        },
      });
      created++;
    } catch (e: any) {
      console.error(`Erro ao criar ${code}: ${e.message}`);
    }
  }

  console.log(`\nResultado:`);
  console.log(`  Criados: ${created}`);
  console.log(`  Ja existiam: ${skipped}`);
  console.log(`  Total no banco agora: ${await prisma.produto.count()}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
