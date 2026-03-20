// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Singleton (evita criar múltiplas conexões em dev com HMR)
export const prisma =
  global.__prisma ??
  new PrismaClient({
    // log: ['query', 'error', 'warn'], // se quiser debugar
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
