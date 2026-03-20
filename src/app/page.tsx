'use client';

import { useEffect, useState } from 'react';

type DashboardData = {
  ok: boolean;
  coletas: {
    emPatio: number;
    carregadas: number;
    emTransito: number;
    entregues: number;
    total: number;
  };
  patio: {
    pesoTotalKg: number;
    valorFreteTotal: number;
    leadTimeMedioDias: number | null;
    leadTimeMaxDias: number | null;
    coletasAcimaLeadTime: number;
    alertaDias: number;
  };
  frota: {
    totalVeiculos: number;
    totalMotoristas: number;
    motoristasDisponiveis: number;
  };
  planejamentos: {
    draft: number;
    planned: number;
    inTransit: number;
    done: number;
  };
  recentColetas: Array<{
    id: string;
    nf: string;
    cidade: string;
    uf: string;
    status: string;
    pesoTotalKg: number | null;
    valorFrete: number | null;
    leadTimeDias: number | null;
    Cliente: { razao: string } | null;
  }>;
};

const fmt = Intl.NumberFormat('pt-BR');
const fmtDec = Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const fmtBRL = Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_LABELS: Record<string, string> = {
  EM_PATIO: 'No Pátio',
  CARREGADA: 'Carregada',
  EM_TRANSITO: 'Em Trânsito',
  ENTREGUE: 'Entregue',
};

const STATUS_COLORS: Record<string, string> = {
  EM_PATIO: '#f59e0b',
  CARREGADA: '#3b82f6',
  EM_TRANSITO: '#8b5cf6',
  ENTREGUE: '#22c55e',
};

export default function HomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setData(j);
        else setError(j.error || 'Erro ao carregar dashboard');
      })
      .catch(() => setError('Falha de conexão'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
        Carregando dashboard...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>
        {error || 'Erro desconhecido'}
      </div>
    );
  }

  const leadTimeColor =
    data.patio.leadTimeMedioDias == null
      ? '#64748b'
      : data.patio.leadTimeMedioDias > 15
        ? '#dc2626'
        : data.patio.leadTimeMedioDias > 7
          ? '#f59e0b'
          : '#16a34a';

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
        Painel BR Transportes
      </h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
        Visão geral operacional em tempo real
      </p>

      {/* ====== KPI Cards ====== */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 24 }}>
        <KpiCard
          label="Coletas no Pátio"
          value={String(data.coletas.emPatio)}
          sub={`${fmt.format(data.patio.pesoTotalKg)} kg total`}
          color="#f59e0b"
          href="/patio"
        />
        <KpiCard
          label="Lead Time Médio"
          value={data.patio.leadTimeMedioDias != null ? `${fmtDec.format(data.patio.leadTimeMedioDias)} dias` : '—'}
          sub={
            data.patio.leadTimeMaxDias != null
              ? `Máx: ${fmtDec.format(data.patio.leadTimeMaxDias)} dias`
              : 'Sem coletas no pátio'
          }
          color={leadTimeColor}
        />
        <KpiCard
          label="Em Trânsito"
          value={String(data.coletas.emTransito)}
          sub={`${data.coletas.carregadas} carregadas`}
          color="#8b5cf6"
        />
        <KpiCard
          label="Entregues"
          value={String(data.coletas.entregues)}
          sub={`de ${fmt.format(data.coletas.total)} total`}
          color="#22c55e"
        />
      </div>

      {/* ====== Alertas ====== */}
      {data.patio.coletasAcimaLeadTime > 0 && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: 20,
            borderRadius: 8,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            fontSize: 13,
          }}
        >
          <b>Alerta:</b> {data.patio.coletasAcimaLeadTime} coleta(s) com mais de {data.patio.alertaDias} dias no pátio.{' '}
          <a href="/patio" style={{ color: '#dc2626', textDecoration: 'underline' }}>
            Ver no pátio
          </a>
        </div>
      )}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr', marginBottom: 24 }}>
        {/* ====== Planejamentos ====== */}
        <div style={card}>
          <h2 style={cardTitle}>Planejamentos</h2>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
            <MiniStat label="Rascunhos" value={data.planejamentos.draft} color="#94a3b8" />
            <MiniStat label="Planejados" value={data.planejamentos.planned} color="#3b82f6" />
            <MiniStat label="Em Trânsito" value={data.planejamentos.inTransit} color="#8b5cf6" />
            <MiniStat label="Concluídos" value={data.planejamentos.done} color="#22c55e" />
          </div>
          <div style={{ marginTop: 12 }}>
            <a href="/planejamento" style={linkBtn}>
              Ir para Planejamento
            </a>
          </div>
        </div>

        {/* ====== Frota ====== */}
        <div style={card}>
          <h2 style={cardTitle}>Frota & Motoristas</h2>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
            <MiniStat label="Veículos" value={data.frota.totalVeiculos} color="#0ea5e9" />
            <MiniStat label="Motoristas" value={data.frota.totalMotoristas} color="#0ea5e9" />
            <MiniStat
              label="Disponíveis"
              value={data.frota.motoristasDisponiveis}
              color="#22c55e"
            />
            <MiniStat
              label="Indisponíveis"
              value={data.frota.totalMotoristas - data.frota.motoristasDisponiveis}
              color="#ef4444"
            />
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <a href="/veiculos" style={linkBtn}>Veículos</a>
            <a href="/motoristas" style={linkBtn}>Motoristas</a>
          </div>
        </div>
      </div>

      {/* ====== Valor no pátio ====== */}
      <div style={{ ...card, marginBottom: 24 }}>
        <h2 style={cardTitle}>Valor em Pátio</h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <div>
            <span style={{ fontSize: 28, fontWeight: 800, color: '#0f172a' }}>
              {fmtBRL.format(data.patio.valorFreteTotal)}
            </span>
            <span style={{ fontSize: 13, color: '#64748b', marginLeft: 8 }}>em frete bruto</span>
          </div>
          <div>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#334155' }}>
              {fmt.format(data.patio.pesoTotalKg)} kg
            </span>
            <span style={{ fontSize: 13, color: '#64748b', marginLeft: 8 }}>peso total</span>
          </div>
        </div>
      </div>

      {/* ====== Coletas recentes ====== */}
      <div style={card}>
        <h2 style={cardTitle}>Últimas Coletas</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
              <th style={thStyle}>NF</th>
              <th style={thStyle}>Cliente</th>
              <th style={thStyle}>Destino</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Peso (kg)</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Frete</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Lead Time</th>
            </tr>
          </thead>
          <tbody>
            {data.recentColetas.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={tdStyle}>
                  <a href={`/coletas/${c.id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                    {c.nf}
                  </a>
                </td>
                <td style={tdStyle}>{c.Cliente?.razao || '—'}</td>
                <td style={tdStyle}>{c.cidade}/{c.uf}</td>
                <td style={tdStyle}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#fff',
                      background: STATUS_COLORS[c.status] || '#94a3b8',
                    }}
                  >
                    {STATUS_LABELS[c.status] || c.status}
                  </span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {c.pesoTotalKg != null ? fmt.format(c.pesoTotalKg) : '—'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {c.valorFrete != null ? fmtBRL.format(c.valorFrete) : '—'}
                </td>
                <td
                  style={{
                    ...tdStyle,
                    textAlign: 'right',
                    fontWeight: 700,
                    color:
                      c.leadTimeDias != null && c.leadTimeDias > 15
                        ? '#dc2626'
                        : c.leadTimeDias != null && c.leadTimeDias > 7
                          ? '#f59e0b'
                          : '#334155',
                  }}
                >
                  {c.leadTimeDias != null ? `${fmtDec.format(c.leadTimeDias)}d` : '—'}
                </td>
              </tr>
            ))}
            {data.recentColetas.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}>
                  Nenhuma coleta registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div style={{ marginTop: 12 }}>
          <a href="/coletas" style={linkBtn}>Ver todas as coletas</a>{/* eslint-disable-line @next/next/no-html-link-for-pages */}
        </div>
      </div>

      {/* ====== Links rápidos ====== */}
      <div style={{ marginTop: 24, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <QuickLink href="/planejamento" label="Planejamento" />
        <QuickLink href="/patio" label="Pátio" />
        <QuickLink href="/coletas" label="Coletas" />
        <QuickLink href="/minutas" label="Minutas" />
        <QuickLink href="/produtos" label="Produtos" />
        <QuickLink href="/scan" label="Scan & Etiquetas" />
        <QuickLink href="/rotas" label="Rotas" />
        <QuickLink href="/entregas" label="Entregas" />
        <QuickLink href="/operacao" label="Operação" />
        <QuickLink href="/relatorios" label="Relatórios" />
        <QuickLink href="/clientes" label="Clientes" />
        <QuickLink href="/veiculos" label="Veículos" />
        <QuickLink href="/motoristas" label="Motoristas" />
      </div>
    </div>
  );
}

// ====== Sub-components ======

const card: React.CSSProperties = {
  padding: 16,
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  background: '#fff',
  boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
};

const cardTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: '#0f172a',
  marginBottom: 12,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontWeight: 700,
  color: '#475569',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  color: '#334155',
};

const linkBtn: React.CSSProperties = {
  display: 'inline-block',
  padding: '6px 14px',
  borderRadius: 6,
  background: '#f1f5f9',
  color: '#334155',
  fontSize: 12,
  fontWeight: 600,
  textDecoration: 'none',
  border: '1px solid #e2e8f0',
};

function KpiCard({
  label,
  value,
  sub,
  color,
  href,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
  href?: string;
}) {
  const inner = (
    <div
      style={{
        ...card,
        borderLeft: `4px solid ${color}`,
        cursor: href ? 'pointer' : undefined,
      }}
    >
      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{sub}</div>
    </div>
  );

  if (href) return <a href={href} style={{ textDecoration: 'none' }}>{inner}</a>;
  return inner;
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 13, color: '#475569' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginLeft: 'auto' }}>
        {value}
      </span>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      style={{
        display: 'block',
        padding: '10px 14px',
        borderRadius: 8,
        border: '1px solid #e2e8f0',
        background: '#fff',
        color: '#334155',
        fontSize: 13,
        fontWeight: 600,
        textDecoration: 'none',
        textAlign: 'center',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </a>
  );
}
