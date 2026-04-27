/**
 * src/lib/nfe/provider.ts
 *
 * Camada de abstração para consulta de NF-e.
 * Atualmente usa um mock que extrai dados reais da chave (CNPJ, nNF, data)
 * e retorna itens simulados.
 *
 * Para trocar de provedor, substitua a função consultarNFe abaixo:
 *
 * ── Webmania ──────────────────────────────────────────────────────────────
 * GET https://webmaniabr.com/api/1/nfe/consultar/?chave={chave}
 * Headers: X-Consumer-Key, X-Consumer-Secret, X-Access-Token, X-Access-Token-Secret
 * Docs: https://webmaniabr.com/docs/rest-api-consulta-nota-fiscal/
 *
 * ── Focus NFe ─────────────────────────────────────────────────────────────
 * GET https://api.focusnfe.com.br/v2/notas_fiscais?chave_nfe={chave}
 * Auth: Basic (token como usuário, senha em branco)
 * Docs: https://focusnfe.com.br/
 *
 * ── Qive (gratuito, XML bruto) ────────────────────────────────────────────
 * Requer parse de XML. Consultar documentação em https://qive.com.br/
 * ──────────────────────────────────────────────────────────────────────────
 */

import type { NFeData } from './types';

// ── Utilitários ────────────────────────────────────────────────────────────

/** Extrai campos estruturados da chave de acesso de 44 dígitos */
function parseChave(chave: string) {
  const d = chave.replace(/\D/g, '');
  const ano  = '20' + d.slice(2, 4);
  const mes  = d.slice(4, 6);
  return {
    cUF:   d.slice(0, 2),
    ano,
    mes,
    cnpj:  d.slice(6, 20),
    mod:   d.slice(20, 22),
    serie: d.slice(22, 25),
    nNF:   String(parseInt(d.slice(25, 34), 10)),  // remove zeros à esquerda
    dhEmi: `${ano}-${mes}-01T12:00:00`,
  };
}

function formatCNPJ(c: string) {
  return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

// ── Mock ───────────────────────────────────────────────────────────────────

async function mockConsultar(chave: string): Promise<NFeData> {
  const p = parseChave(chave);

  return {
    chave,
    nNF:    p.nNF,
    serie:  p.serie,
    dhEmi:  p.dhEmi,
    isMock: true,
    fonte:  'mock',
    emitente: {
      cnpj:        formatCNPJ(p.cnpj),
      razaoSocial: 'EMPRESA DEMO LTDA  ⚠️ dado simulado',
      cidade:      'Ribeirão Preto',
      uf:          'SP',
      endereco:    'Rua das Máquinas, 100',
    },
    destinatario: {
      razaoSocial: 'BR TRANSPORTES',
      cidade:      'Sertãozinho',
      uf:          'SP',
    },
    vNF:       12500.00,
    pesoTotal: 450,
    itens: [
      {
        nItem:      1,
        cProd:      'PULV-PEC-600',
        xProd:      'PULVERIZADOR TURBO 600L',
        qCom:       1,
        uCom:       'UN',
        vUnCom:     8500,
        vProd:      8500,
        pesoLiq:    280,
        pesoBruto:  295,
      },
      {
        nItem:      2,
        cProd:      'ENSI-JF60-DEMO',
        xProd:      'ENSILADEIRA JF-60 MAX',
        qCom:       1,
        uCom:       'UN',
        vUnCom:     4000,
        vProd:      4000,
        pesoLiq:    155,
        pesoBruto:  160,
      },
    ],
  };
}

// ── Ponto de entrada público ───────────────────────────────────────────────
// Troque mockConsultar por uma função real quando escolher o provedor.

export async function consultarNFe(chave: string): Promise<NFeData> {
  // TODO: substituir por provedor real
  // if (process.env.WEBMANIA_KEY) return webmaniaConsultar(chave);
  return mockConsultar(chave);
}
