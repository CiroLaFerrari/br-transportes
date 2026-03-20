// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

declare global {
  var __prisma: PrismaClient | undefined;
}

function makePrisma() {
  return new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  });
}

// Singleton (evita criar múltiplas conexões em dev com HMR)
export const prisma = global.__prisma ?? makePrisma();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
