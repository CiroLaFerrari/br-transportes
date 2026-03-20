import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ... resto do seu script aqui
function normEtq(raw: string) {
  let s = String(raw || '').trim().toUpperCase();
  if (!s) return '';
  if (s.startsWith('ETQ-')) s = s.slice(4);
  if (s.startsWith('ETQ:')) s = s.slice(4);
  return s.trim().toUpperCase();
}

async function main() {
  const vols = await prisma.itemVolume.findMany({
    select: { id: true, etiqueta: true, createdAt: true, scannedAt: true, itemColetadoId: true },
    orderBy: { createdAt: 'asc' },
  });

  const groups = new Map<string, typeof vols>();
  for (const v of vols) {
    const n = normEtq(v.etiqueta);
    if (!n) continue;
    const arr = groups.get(n) || [];
    arr.push(v);
    groups.set(n, arr);
  }

  let updated = 0;
  let dups = 0;

  for (const [norm, arr] of groups.entries()) {
    // escolhe canônico: prioriza quem já foi scaneado; senão o mais antigo
    const sorted = [...arr].sort((a, b) => {
      const as = a.scannedAt ? 0 : 1;
      const bs = b.scannedAt ? 0 : 1;
      if (as !== bs) return as - bs;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const canonical = sorted[0];

    // 1) atualiza canônico para norm (se necessário)
    if (canonical.etiqueta !== norm) {
      await prisma.itemVolume.update({
        where: { id: canonical.id },
        data: { etiqueta: norm },
      });
      updated++;
    }

    // 2) demais viram DUP para não quebrar unique
    for (const v of sorted.slice(1)) {
      const suffix = v.id.slice(-6).toUpperCase();
      const dupTag = `${norm}__DUP__${suffix}`;

      if (v.etiqueta !== dupTag) {
        await prisma.itemVolume.update({
          where: { id: v.id },
          data: { etiqueta: dupTag },
        });
        dups++;

        try {
          await prisma.scanEvent.create({
            data: {
              etiqueta: `ETQ:${norm}`,
              status: 'ETIQUETA_DUP_NORMALIZE',
              note: `Colisão ao normalizar ItemVolume.etiqueta. canonical=${canonical.id} dup=${v.id} old="${v.etiqueta}" new="${dupTag}"`,
            },
          });
        } catch {}
      }
    }
  }

  console.log(`OK. updated=${updated} dups=${dups} total=${vols.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
await prisma.$disconnect();