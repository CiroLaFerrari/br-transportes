// src/lib/nfe/types.ts

export interface NFeEmitente {
  cnpj: string;
  razaoSocial: string;
  cidade: string;
  uf: string;
  endereco?: string;
}

export interface NFeDestinatario {
  cnpj?: string;
  razaoSocial?: string;
  cidade: string;
  uf: string;
}

export interface NFeItem {
  nItem: number;
  cProd: string;    // código do produto no emitente
  xProd: string;    // descrição do produto
  qCom: number;     // quantidade
  uCom: string;     // unidade
  vUnCom: number;   // valor unitário
  vProd: number;    // valor total do item
  pesoLiq?: number; // kg
  pesoBruto?: number;
}

export interface NFeData {
  chave: string;
  nNF: string;
  serie: string;
  dhEmi: string;        // ISO date string
  emitente: NFeEmitente;
  destinatario?: NFeDestinatario;
  vNF: number;
  pesoTotal?: number;
  itens: NFeItem[];
  isMock: boolean;
  fonte: 'mock' | 'webmania' | 'focusnfe' | 'qive';
}
