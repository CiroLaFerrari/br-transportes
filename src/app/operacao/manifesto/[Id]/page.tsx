// src/app/operacao/manifesto/[Id]/page.tsx
import { prisma } from '@/lib/prisma';

type ManifestoParams = {
  // 👇 também como Promise, seguindo o padrão do Next 15
  params: Promise<{ id?: string; Id?: string }>;
};

function formatNumber(value: number | null | undefined, decimals = 2) {
  if (value == null || Number.isNaN(value)) return '-';
  return value.toFixed(decimals).replace('.', ',');
}

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '-';
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

function formatDuration(minutos: number | null | undefined) {
  if (!minutos || Number.isNaN(minutos)) return '-';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

function formatDateTime(date: Date | string | null | undefined) {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export default async function ManifestoPage({ params }: ManifestoParams) {
  // 👇 agora sim: await params
  const { id, Id } = await params;
  const planoId = id ?? Id; // pega o que existir

  if (!planoId) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 p-6">
        <h1 className="text-xl font-semibold mb-4">
          Manifesto / Resumo de carga
        </h1>
        <div className="rounded border border-red-500/50 bg-red-900/30 px-4 py-3 text-sm text-red-100">
          Erro: parâmetro <code>id</code> do planejamento é obrigatório.
        </div>
      </div>
    );
  }

  const plano = await prisma.planejamento.findUnique({
    where: { id: planoId },
    include: {
      Motorista: true,
      Veiculo: true,
      paradas: {
        include: {
          Coleta: {
            include: {
              Cliente: true,
              itens: true,
            },
          },
        },
        orderBy: { ordem: 'asc' },
      },
    },
  });

  if (!plano) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 p-6">
        <h1 className="text-xl font-semibold mb-4">
          Manifesto / Resumo de carga
        </h1>
        <div className="rounded border border-red-500/50 bg-red-900/30 px-4 py-3 text-sm text-red-100">
          Planejamento não encontrado.
        </div>
      </div>
    );
  }

  const entregas = plano.paradas.map((p, idx) => {
    const c = p.Coleta;
    const itens = c?.itens ?? [];
    const volumes = itens.length;
    const pesoKg = c?.pesoTotalKg ?? null;

    return {
      ordem: p.ordem ?? idx + 1,
      nf: c?.nf ?? '-',
      cliente: c?.Cliente?.razao ?? '-',
      cidade: c?.cidade ?? '-',
      uf: c?.uf ?? '-',
      volumes,
      pesoKg,
      valorFrete: c?.valorFrete ?? null,
      kmTrecho: p.kmTrecho ?? null,
      durMinTrecho: p.durMinTrecho ?? null,
    };
  });

  const totais = entregas.reduce(
    (acc, e) => {
      acc.volumes += e.volumes;
      acc.pesoKg += e.pesoKg || 0;
      acc.qtdNf += e.nf === '-' ? 0 : 1;
      return acc;
    },
    { volumes: 0, pesoKg: 0, qtdNf: 0 },
  );

  const resumoRota = entregas.reduce(
    (acc, e) => {
      acc.km += e.kmTrecho || 0;
      acc.min += e.durMinTrecho || 0;
      acc.freteTotal += e.valorFrete || 0;
      return acc;
    },
    { km: 0, min: 0, freteTotal: 0 },
  );

  const fretePorKm =
    resumoRota.km > 0 ? resumoRota.freteTotal / resumoRota.km : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6 print:bg-white print:text-black">
      {/* Cabeçalho */}
      <header className="mb-6 border-b border-slate-700 pb-4 print:border-black">
        <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide">
              BR TRANSPORTES
            </h1>
            <p className="text-sm text-slate-400">
              Manifesto de Carga &nbsp;•&nbsp; Resumo operacional
            </p>
          </div>

          <div className="text-xs md:text-sm text-right space-y-1">
            <div>
              <span className="font-semibold">Rota:</span> {plano.name}
            </div>
            <div>
              <span className="font-semibold">Status plano:</span>{' '}
              {plano.status}
            </div>
            <div>
              <span className="font-semibold">Criado em:</span>{' '}
              {formatDateTime(plano.createdAt)}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs md:text-sm">
          <div className="rounded border border-slate-700 px-3 py-2 print:border-black">
            <div className="font-semibold text-slate-200">Motorista</div>
            <div>
              {plano.Motorista?.nome || plano.driverName || '— não definido —'}
            </div>
          </div>
          <div className="rounded border border-slate-700 px-3 py-2 print:border-black">
            <div className="font-semibold text-slate-200">Veículo</div>
            <div>
              {plano.Veiculo?.placa ||
                plano.vehiclePlate ||
                '— não definido —'}
            </div>
          </div>
          <div className="rounded border border-slate-700 px-3 py-2 print:border-black">
            <div className="font-semibold text-slate-200">
              Totais de carga
            </div>
            <div>
              {totais.qtdNf} NF(s) • {totais.volumes} volume(s) •{' '}
              {formatNumber(totais.pesoKg)} kg
            </div>
          </div>
          <div className="rounded border border-slate-700 px-3 py-2 print:border-black">
            <div className="font-semibold text-slate-200">
              Resumo de rota (planejado)
            </div>
            <div>
              {formatNumber(resumoRota.km)} km •{' '}
              {formatDuration(resumoRota.min)}
            </div>
          </div>
        </div>

        {/* Bloco financeiro (frete) */}
        <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs md:text-sm">
          <div className="rounded border border-slate-700 px-3 py-2 print:border-black">
            <div className="font-semibold text-slate-200">
              Frete total (rota)
            </div>
            <div>{formatCurrency(resumoRota.freteTotal)}</div>
          </div>
          <div className="rounded border border-slate-700 px-3 py-2 print:border-black">
            <div className="font-semibold text-slate-200">
              Frete médio por NF
            </div>
            <div>
              {totais.qtdNf > 0
                ? formatCurrency(resumoRota.freteTotal / totais.qtdNf)
                : '-'}
            </div>
          </div>
          <div className="rounded border border-slate-700 px-3 py-2 print:border-black">
            <div className="font-semibold text-slate-200">
              Frete médio por km
            </div>
            <div>{formatCurrency(fretePorKm)}</div>
          </div>
        </div>
      </header>

      {/* ... resto do arquivo (tabela, assinaturas, Ctrl+P) igual ao que te mandei antes ... */}
    </div>
  );
}
