// src/app/roteiro-motorista/page.tsx
'use client';

import React, { useEffect, useState } from 'react';

type ExecStatus = 'PENDENTE' | 'EM_ATENDIMENTO' | 'ENTREGUE' | 'FALHA';

type ParadaRoteiro = {
  id: string;
  ordem: number;
  label: string;
  kmTrecho: number | null;
  durMinTrecho: number | null;
  statusExec?: ExecStatus | null;
  checkinAt?: string | null;
  checkoutAt?: string | null;
  obsStatus?: string | null;
  Coleta?: {
    id: string;
    nf: string;
    cidade: string;
    uf: string;
    valorFrete: number | null;
    pesoTotalKg: number | null;
  } | null;
};

type PlanoRoteiro = {
  id: string;
  name: string;
  status: 'DRAFT' | 'PLANNED' | 'IN_TRANSIT' | 'DONE' | 'CANCELED';
  driverName: string | null;
  vehiclePlate: string | null;
  createdAt: string;
  paradas: ParadaRoteiro[];
};

type ApiResp = {
  ok: boolean;
  planos?: PlanoRoteiro[];
  error?: string;
};

function fmtDateTime(iso?: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function statusPlanoBadgeColor(status: PlanoRoteiro['status']) {
  switch (status) {
    case 'PLANNED':
      return 'bg-blue-100 text-blue-800';
    case 'IN_TRANSIT':
      return 'bg-amber-100 text-amber-900';
    case 'DONE':
      return 'bg-emerald-100 text-emerald-800';
    case 'CANCELED':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

// Texto do status da PARADA (executado)
function statusParadaTexto(p: ParadaRoteiro) {
  const st: ExecStatus = (p.statusExec as ExecStatus) ?? 'PENDENTE';

  if (st === 'ENTREGUE') return 'Entregue';
  if (st === 'FALHA') return 'Falha';

  // fallback: se tem checkin e não tem checkout, consideramos "Em atendimento"
  if (p.checkinAt && !p.checkoutAt) return 'Em atendimento';

  return 'Pendente';
}

function statusParadaBadgeColor(statusTexto: string) {
  switch (statusTexto) {
    case 'Entregue':
      return 'bg-emerald-900/60 text-emerald-100 border border-emerald-500/40';
    case 'Falha':
      return 'bg-red-900/60 text-red-100 border border-red-500/40';
    case 'Em atendimento':
      return 'bg-amber-900/60 text-amber-100 border border-amber-500/40';
    default:
      return 'bg-slate-800 text-slate-100 border border-slate-600';
  }
}

type AcaoExec = 'CHECKIN' | 'FINALIZAR' | 'FALHA';

export default function RoteiroMotoristaPage() {
  const [motorista, setMotorista] = useState('João Silva');
  const [data, setData] = useState(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  const [planos, setPlanos] = useState<PlanoRoteiro[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [executando, setExecutando] = useState<string | null>(null);

  async function carregarRoteiro() {
    try {
      setLoading(true);
      setError(null);
      setMensagem(null);
      setPlanos([]);

      const params = new URLSearchParams();
      if (motorista.trim()) params.set('motorista', motorista.trim());
      if (data) params.set('data', data);

      const res = await fetch(
        `/api/roteiros/por-motorista?${params.toString()}`,
      );
      const j: ApiResp = await res.json();

      if (!res.ok || !j.ok) {
        throw new Error(j.error || 'Falha ao carregar roteiros');
      }

      setPlanos(j.planos || []);
      if (!j.planos || j.planos.length === 0) {
        setMensagem('Nenhum roteiro encontrado para os filtros.');
      }
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar roteiros');
    } finally {
      setLoading(false);
    }
  }

  // Carrega na primeira vez com a data de hoje
  useEffect(() => {
    void carregarRoteiro();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function executarAcao(paradaId: string, acao: AcaoExec) {
    try {
      const key = `${paradaId}:${acao}`;
      setExecutando(key);

      const obs =
        acao === 'FALHA'
          ? window.prompt('Informe o motivo da falha da parada:')?.trim()
          : undefined;

      const res = await fetch(`/api/paradas/${paradaId}/exec`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: acao, // CHECKIN, FINALIZAR ou FALHA
          obsStatus: obs,
        }),
      });

      const j = await res.json();
      if (!res.ok || !j.ok) {
        throw new Error(j.error || 'Falha ao atualizar parada');
      }

      await carregarRoteiro();
    } catch (e: any) {
      setError(e?.message || 'Falha ao atualizar parada');
    } finally {
      setExecutando(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Título */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-50">
          Roteiro do motorista
        </h1>
        <p className="text-sm text-slate-400">
          Veja os planejamentos do dia com as paradas na ordem de atendimento e
          faça o controle de execução.
        </p>
      </div>

      {/* Filtros */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-200 mb-1">
              Motorista
            </label>
            <input
              type="text"
              value={motorista}
              onChange={(e) => setMotorista(e.target.value)}
              placeholder="Ex.: João, Maria..."
              className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-50 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              Busca por nome cadastrado ou campo &quot;Motorista&quot; do
              planejamento.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">
              Data
            </label>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-50 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <button
              type="button"
              onClick={carregarRoteiro}
              disabled={loading}
              className="inline-flex items-center rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
            >
              {loading ? 'Carregando…' : 'Carregar roteiro'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-red-500/40 bg-red-900/40 px-3 py-2 text-xs text-red-100">
            {error}
          </div>
        )}
        {mensagem && !error && (
          <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-900/30 px-3 py-2 text-xs text-emerald-100">
            {mensagem}
          </div>
        )}
      </div>

      {/* Lista de planejamentos */}
      <div className="space-y-4">
        {planos.length === 0 && !loading && !error && (
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300 shadow-sm">
            Nenhum planejamento encontrado para os filtros informados.
          </div>
        )}

        {planos.map((plano) => {
          // índice da primeira parada ainda não concluída (nem falha)
          const primeiraAbertaIdx = plano.paradas.findIndex((pp) => {
            const st = statusParadaTexto(pp);
            return st !== 'Entregue' && st !== 'Falha';
          });

          return (
            <div
              key={plano.id}
              className="rounded-lg border border-slate-700 bg-slate-900/70 p-4 shadow-sm"
            >
              {/* Cabeçalho do card */}
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-50">
                    {plano.name || 'Planejamento sem nome'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Criado em {fmtDateTime(plano.createdAt)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-medium ${statusPlanoBadgeColor(
                      plano.status,
                    )}`}
                  >
                    {plano.status}
                  </span>
                  {plano.driverName && (
                    <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-slate-100">
                      Motorista: {plano.driverName}
                    </span>
                  )}
                  {plano.vehiclePlate && (
                    <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-slate-100">
                      Veículo: {plano.vehiclePlate}
                    </span>
                  )}

                  {/* Botão de Manifesto */}
                  <a
                    href={`/operacao/manifesto/${plano.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-md border border-slate-600 px-3 py-1 text-xs font-medium text-slate-100 hover:bg-slate-800"
                  >
                    Manifesto / resumo
                  </a>
                </div>
              </div>

              {/* Tabela de paradas */}
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-800/80">
                      <th className="px-2 py-1 font-semibold text-slate-200 w-10">
                        #
                      </th>
                      <th className="px-2 py-1 font-semibold text-slate-200">
                        Parada
                      </th>
                      <th className="px-2 py-1 font-semibold text-slate-200">
                        Coleta / NF
                      </th>
                      <th className="px-2 py-1 font-semibold text-slate-200">
                        Status
                      </th>
                      <th className="px-2 py-1 font-semibold text-slate-200">
                        Execução
                      </th>
                      <th className="px-2 py-1 font-semibold text-slate-200 text-right">
                        Km (trecho)
                      </th>
                      <th className="px-2 py-1 font-semibold text-slate-200 text-right">
                        Min (trecho)
                      </th>
                      <th className="px-2 py-1 font-semibold text-slate-200 text-center">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {plano.paradas.map((p, idx) => {
                      const statusTexto = statusParadaTexto(p);
                      const keyCheckin = `${p.id}:CHECKIN`;
                      const keyFinish = `${p.id}:FINALIZAR`;
                      const keyFail = `${p.id}:FALHA`;

                      const paradaBloqueada =
                        primeiraAbertaIdx !== -1 && idx !== primeiraAbertaIdx;

                      const podeCheckin =
                        !paradaBloqueada &&
                        !p.checkinAt &&
                        !p.checkoutAt &&
                        statusTexto !== 'Falha';

                      const podeFinish =
                        !paradaBloqueada &&
                        !!p.checkinAt &&
                        !p.checkoutAt &&
                        statusTexto !== 'Falha';

                      const podeFail =
                        !paradaBloqueada &&
                        !p.checkoutAt &&
                        statusTexto !== 'Falha';

                      return (
                        <tr
                          key={p.id}
                          className="border-b border-slate-800 last:border-0"
                        >
                          <td className="px-2 py-1 text-slate-300">
                            {p.ordem}
                          </td>
                          <td className="px-2 py-1 text-slate-100">
                            {p.label}
                            {p.obsStatus && (
                              <div className="mt-0.5 text-[11px] text-slate-400">
                                Obs: {p.obsStatus}
                              </div>
                            )}
                            {paradaBloqueada && (
                              <div className="mt-0.5 text-[10px] text-slate-500">
                                Aguarde concluir as paradas anteriores.
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1 text-slate-300">
                            {p.Coleta ? (
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  NF {p.Coleta.nf}
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  {p.Coleta.cidade} / {p.Coleta.uf}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-500">
                                (sem coleta vinculada)
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-slate-200">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusParadaBadgeColor(
                                statusTexto,
                              )}`}
                            >
                              {statusTexto}
                            </span>
                          </td>
                          <td className="px-2 py-1 text-slate-300">
                            <div className="text-[11px]">
                              Check-in: {fmtDateTime(p.checkinAt)}
                            </div>
                            <div className="text-[11px]">
                              Checkout: {fmtDateTime(p.checkoutAt)}
                            </div>
                          </td>
                          <td className="px-2 py-1 text-right text-slate-200">
                            {p.kmTrecho != null ? p.kmTrecho.toFixed(2) : '-'}
                          </td>
                          <td className="px-2 py-1 text-right text-slate-200">
                            {p.durMinTrecho != null ? p.durMinTrecho : '-'}
                          </td>
                          <td className="px-2 py-1 text-center align-top">
                            <div className="inline-flex flex-col gap-1">
                              {/* Check-in */}
                              <button
                                type="button"
                                onClick={() =>
                                  executarAcao(p.id, 'CHECKIN')
                                }
                                disabled={
                                  !podeCheckin ||
                                  executando === keyCheckin
                                }
                                className={`rounded border px-2 py-1 text-[11px] font-medium transition ${
                                  podeCheckin
                                    ? 'border-emerald-500 text-emerald-100 hover:bg-emerald-600/20'
                                    : 'border-slate-700 text-slate-500 cursor-not-allowed opacity-60'
                                }`}
                              >
                                {executando === keyCheckin
                                  ? 'Enviando...'
                                  : 'Check-in'}
                              </button>

                              {/* Finalizar */}
                              <button
                                type="button"
                                onClick={() =>
                                  executarAcao(p.id, 'FINALIZAR')
                                }
                                disabled={
                                  !podeFinish || executando === keyFinish
                                }
                                className={`rounded border px-2 py-1 text-[11px] font-medium transition ${
                                  podeFinish
                                    ? 'border-sky-500 text-sky-100 hover:bg-sky-600/20'
                                    : 'border-slate-700 text-slate-500 cursor-not-allowed opacity-60'
                                }`}
                              >
                                {executando === keyFinish
                                  ? 'Enviando...'
                                  : 'Finalizar'}
                              </button>

                              {/* Falha */}
                              <button
                                type="button"
                                onClick={() => executarAcao(p.id, 'FALHA')}
                                disabled={
                                  !podeFail || executando === keyFail
                                }
                                className={`rounded border px-2 py-1 text-[11px] font-medium transition ${
                                  podeFail
                                    ? 'border-red-500 text-red-100 hover:bg-red-600/20'
                                    : 'border-slate-700 text-slate-500 cursor-not-allowed opacity-60'
                                }`}
                              >
                                {executando === keyFail
                                  ? 'Enviando...'
                                  : 'Falha'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {plano.paradas.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-2 py-2 text-center text-slate-500"
                        >
                          Nenhuma parada cadastrada neste planejamento.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
