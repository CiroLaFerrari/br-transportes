// src/lib/prisma-delegates.ts
import { prisma } from '@/lib/prisma';

type DelegateResult = {
  delegate: any | null;
  key: string | null;
  available: string[];
};

function listDelegates(db: any) {
  return Object.keys(db || {}).filter((k) => db?.[k] && typeof db?.[k] === 'object');
}

export function getDelegateByCandidates(candidates: string[], requiredFn: string): DelegateResult {
  const db: any = prisma as any;

  for (const key of candidates) {
    const d = db?.[key];
    if (d && typeof d?.[requiredFn] === 'function') {
      return { delegate: d, key, available: listDelegates(db) };
    }
  }

  const available = Object.keys(db || {}).filter((k) => db?.[k] && typeof db?.[k]?.[requiredFn] === 'function');
  return { delegate: null, key: null, available };
}

export function getMinutaDelegate(requiredFn: 'findMany' | 'findUnique' | 'create' | 'update' | 'delete' = 'findMany') {
  // Seu schema hoje é "MinutaConferencia", mas deixamos tolerante.
  const candidates = [
    'minuta',
    'Minuta',
    'minutaConferencia',
    'MinutaConferencia',
    'minuta_de_conferencia',
    'minutaDeConferencia',
    'MinutaDeConferencia',
  ];

  return getDelegateByCandidates(candidates, requiredFn);
}
