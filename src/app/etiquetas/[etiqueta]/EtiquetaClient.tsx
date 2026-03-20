'use client';

import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

type Etiqueta = {
  id: string;
  codigoEtiqueta: string;
  nf: string;
  cliente: string;
  cidade: string;
  uf: string;
  itemCodigo: string;
  itemDescricao: string;
  volume: number;
  totalVolumes: number;
  pesoKg: number | null;
  coletaId: string;
  dataColeta: string; // ISO
};

type ApiResp = {
  ok: boolean;
  etiqueta?: Etiqueta;
  error?: string;
  debug?: any;
};

type Props = {
  etiquetaParam: string;
};

function fmtDate(iso?: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

export default function EtiquetaClient({ etiquetaParam }: Props) {
  const [etiqueta, setEtiqueta] = useState<Etiqueta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 1) Busca etiqueta REAL na API
  useEffect(() => {
    async function fetchEtiqueta() {
      try {
        setLoading(true);
        setErro(null);
        setEtiqueta(null);

        const res = await fetch(
          `/api/etiquetas/${encodeURIComponent(etiquetaParam)}`,
        );
        const j: ApiResp = await res.json();

        if (!res.ok || !j.ok || !j.etiqueta) {
          throw new Error(j.error || 'Não foi possível carregar a etiqueta.');
        }

        setEtiqueta(j.etiqueta);
      } catch (e: any) {
        setErro(e?.message || 'Falha ao carregar etiqueta.');
      } finally {
        setLoading(false);
      }
    }

    void fetchEtiqueta();
  }, [etiquetaParam]);

  // 2) Gera o QR **usando o código da etiqueta** e apontando para /scan?etiqueta=...
  useEffect(() => {
    if (!canvasRef.current) return;

    const codigo = (etiqueta?.codigoEtiqueta || etiquetaParam).trim();
    if (!codigo) return;

    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';

    const qrData = origin
      ? `${origin}/scan?etiqueta=${encodeURIComponent(codigo)}`
      : codigo;

    QRCode.toCanvas(canvasRef.current, qrData, {
      width: 260,
      margin: 1,
    }).catch((err) => {
      console.error('Erro ao gerar QRCode:', err);
    });
  }, [etiqueta, etiquetaParam]);

  const titulo =
    etiqueta?.codigoEtiqueta || etiquetaParam || 'ETQ';

  function handlePrint() {
    window.print();
  }

  function handleBack() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/';
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 print:bg-white print:text-black">
      {/* Cabeçalho (tela) */}
      <header className="border-b border-slate-700 bg-slate-950 px-4 py-3 print:hidden">
        <div className="text-sm font-semibold">BR TRANSPORTES</div>
        <div className="text-xs text-slate-400">
          Painel interno • Planejamento &amp; Operação
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4">
        {/* Título + ações (tela) */}
        <div className="mb-3 flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-2xl font-semibold">Etiqueta: {titulo}</h1>
            {etiqueta && (
              <p className="text-xs text-slate-400">
                NF {etiqueta.nf} · {etiqueta.cliente} · {etiqueta.cidade}/
                {etiqueta.uf}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={!etiqueta}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              Imprimir
            </button>
            <button
              type="button"
              onClick={handleBack}
              className="rounded-md border border-slate-500 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800"
            >
              Voltar
            </button>
          </div>
        </div>

        {erro && (
          <div className="mb-3 rounded-md border border-red-500/40 bg-red-900/40 px-3 py-2 text-sm text-red-100 print:hidden">
            Erro ao carregar etiqueta: {erro}
          </div>
        )}

        {/* Se não tiver etiqueta (erro real), mostra aviso simples */}
        {!etiqueta && !loading && (
          <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-900/40 px-3 py-2 text-sm text-amber-100">
            Não foi possível exibir os dados desta etiqueta.
          </div>
        )}

        {/* Layout da etiqueta para impressão */}
        {etiqueta && (
          <div className="border border-slate-500 bg-slate-950 p-3 text-[11px] text-slate-50 print:border-black print:bg-white print:text-black">
            {/* Cabeçalho "matricial" */}
            <div className="mb-1 flex justify-between">
              <div className="font-semibold">
                BR TRANSPORTES
                <div className="text-[10px] font-normal">
                  Logística &amp; Distribuição
                </div>
              </div>
              <div className="text-right text-[10px]">
                <div>
                  NF:{' '}
                  <span className="font-semibold">
                    {etiqueta.nf}
                  </span>
                </div>
                <div>
                  Coleta:{' '}
                  <span className="font-semibold">
                    {etiqueta.coletaId}
                  </span>
                </div>
                <div>
                  Vol:{' '}
                  <span className="font-semibold">
                    {etiqueta.volume}/{etiqueta.totalVolumes}
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-1 border-y border-dotted border-slate-500 py-1 text-[10px] print:border-black">
              <div>
                Cliente:{' '}
                <span className="font-semibold">
                  {etiqueta.cliente}
                </span>
              </div>
              <div>
                Destino:{' '}
                <span className="font-semibold">
                  {etiqueta.cidade} / {etiqueta.uf}
                </span>
              </div>
            </div>

            <div className="mt-1 flex gap-4">
              <div className="flex-1 text-[10px] leading-snug">
                <div>
                  Item:{' '}
                  <span className="font-semibold">
                    {etiqueta.itemCodigo}
                  </span>
                </div>
                <div className="mb-1">
                  {etiqueta.itemDescricao}
                </div>
                <div>
                  Peso aprox.:{' '}
                  <span className="font-semibold">
                    {etiqueta.pesoKg != null
                      ? `${etiqueta.pesoKg.toFixed(1)} kg`
                      : '—'}
                  </span>
                </div>
                <div>
                  Data coleta:{' '}
                  <span className="font-semibold">
                    {fmtDate(etiqueta.dataColeta)}
                  </span>
                </div>
                <div className="mt-2 text-[9px] text-slate-400 print:text-black">
                  Observação: Conferir volume na coleta, carregamento e entrega.
                </div>
                <div className="mt-1 text-[9px] text-slate-400 print:text-black">
                  Código:{' '}
                  <span className="font-mono">
                    {etiqueta.codigoEtiqueta}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-center">
                <div className="border border-slate-900 bg-white p-2 print:border-black">
                  <canvas ref={canvasRef} />
                </div>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <p className="mt-3 text-xs text-slate-400 print:hidden">
            Carregando etiqueta…
          </p>
        )}
      </main>
    </div>
  );
}
