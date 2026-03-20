// src/app/coletas/[id]/etiquetas/EtiquetasColetaClient.tsx
'use client';

import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

type EtiquetaVolume = {
  id: string;
  codigo: string;
  volumeNumero: number;
  volumeTotal: number;
  produtoDescricao: string;
};

type EtiquetasPageData = {
  coletaId: string;
  nf: string;
  cliente: string;
  cidade: string;
  uf: string;
  pesoTotalKg: number | null;
  etiquetas: EtiquetaVolume[];
};

type Props = {
  data: EtiquetasPageData;
};

function EtiquetaCard({
  header,
  etiqueta,
}: {
  header: {
    nf: string;
    cliente: string;
    cidade: string;
    uf: string;
    pesoTotalKg: number | null;
  };
  etiqueta: EtiquetaVolume;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, etiqueta.codigo, {
      width: 160,
      margin: 1,
    }).catch(() => {
      // se der erro, deixa passar sem quebrar tela
    });
  }, [etiqueta.codigo]);

  return (
    <div className="break-inside-avoid rounded border border-slate-700 bg-slate-950/80 p-3 print:border-black print:bg-white">
      <div className="mb-1 flex justify-between text-[11px] font-mono">
        <div className="pr-2">
          <div className="font-semibold">
            NF {header.nf} · {header.cliente}
          </div>
          <div className="text-slate-400">
            Destino: {header.cidade} / {header.uf}
          </div>
        </div>
        <div className="text-right text-[10px] text-slate-400">
          Código:
          <br />
          <span className="font-semibold text-slate-100">
            {etiqueta.codigo}
          </span>
        </div>
      </div>

      <div className="mt-1 flex gap-3">
        <div className="flex-1 text-[11px] font-mono leading-tight">
          <div>
            Item:{' '}
            {etiqueta.produtoDescricao
              ? etiqueta.produtoDescricao
              : '(sem descrição)'}
          </div>
          <div>
            Volume: {etiqueta.volumeNumero} / {etiqueta.volumeTotal}
          </div>
          {header.pesoTotalKg != null && (
            <div>Peso total da coleta: {header.pesoTotalKg.toFixed(2)} kg</div>
          )}
          <div className="mt-2 text-[9px] text-slate-400 print:text-black">
            Observação: Conferir volume na coleta, carregamento e entrega.
          </div>
        </div>

        <div className="flex items-center justify-center">
          <canvas
            ref={canvasRef}
            className="h-32 w-32"
            aria-label={`QR da etiqueta ${etiqueta.codigo}`}
          />
        </div>
      </div>

      <div className="mt-1 text-center text-[9px] font-mono text-slate-500 print:text-black">
        Conferir código na conferência. Proibido copiar ou danificar etiqueta.
      </div>
    </div>
  );
}

export default function EtiquetasColetaClient({ data }: Props) {
  const { etiquetas } = data;

  function handleImprimir() {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }

  function handleVoltar() {
    if (typeof window !== 'undefined') {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = `/coletas/${data.coletaId}`;
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-4 print:bg-white print:text-black">
      {/* Cabeçalho */}
      <header className="mb-4 flex flex-col gap-2 border-b border-slate-700 pb-3 text-sm print:border-black">
        <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">
              Etiquetas da coleta {data.coletaId}
            </h1>
            <p className="text-xs text-slate-400">
              NF {data.nf} · {data.cliente} · {data.cidade}/{data.uf}
            </p>
          </div>

          <div className="flex gap-2 text-xs print:hidden">
            <button
              type="button"
              onClick={handleImprimir}
              className="rounded border border-sky-500 bg-sky-600 px-3 py-1 font-medium text-white hover:bg-sky-700"
            >
              Imprimir todas
            </button>
            <button
              type="button"
              onClick={handleVoltar}
              className="rounded border border-slate-600 px-3 py-1 font-medium text-slate-100 hover:bg-slate-800"
            >
              Voltar
            </button>
          </div>
        </div>

        <div className="mt-1 text-xs text-slate-400">
          Total de etiquetas geradas: {etiquetas.length}
        </div>
      </header>

      {/* Grid de etiquetas */}
      {etiquetas.length === 0 ? (
        <div className="rounded border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300 print:border-black print:bg-white">
          Nenhum item com etiqueta cadastrado para esta coleta.
        </div>
      ) : (
        <main className="grid grid-cols-1 gap-4 md:grid-cols-2 print:grid-cols-2 print:gap-2">
          {etiquetas.map((et) => (
            <EtiquetaCard
              key={et.id}
              header={{
                nf: data.nf,
                cliente: data.cliente,
                cidade: data.cidade,
                uf: data.uf,
                pesoTotalKg: data.pesoTotalKg,
              }}
              etiqueta={et}
            />
          ))}
        </main>
      )}
    </div>
  );
}
