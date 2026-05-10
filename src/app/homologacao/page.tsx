'use client';

// ─────────────────────────────────────────────────────────────────────────────
// /homologacao — Painel de acompanhamento das modificações solicitadas
// ─────────────────────────────────────────────────────────────────────────────

type StatusType = 'done' | 'progress' | 'pending';

type Item = {
  id: number;
  title: string;
  desc: string;
  status: StatusType;
  tag?: string;
};

const ITEMS: Item[] = [
  {
    id: 1,
    title: 'Tacógrafo em Veículos',
    desc: '3º campo de upload (PDF + data de vencimento) no schema, API e frontend do cadastro de veículos. Alerta visual quando o documento está vencido ou próximo do vencimento.',
    status: 'done',
    tag: 'Veículos',
  },
  {
    id: 2,
    title: 'Relatórios — Faixas atualizadas',
    desc: 'Faixas de lead time ajustadas (≤3, 4-7, 8-15, >15 dias). Coluna CNPJ adicionada nas tabelas de análise por cliente e no exportar Excel/CSV.',
    status: 'done',
    tag: 'Relatórios',
  },
  {
    id: 3,
    title: 'Representatividade NF',
    desc: 'Na tela de detalhe da coleta: % de peso e % de frete de cada NF na carga total, capacidade do veículo vinculado e tabela comparativa entre NFs.',
    status: 'done',
    tag: 'Coletas',
  },
  {
    id: 4,
    title: 'Google Maps — Substituição do Leaflet',
    desc: 'Google Maps integrado em planejamento, rotas e mapa. Markers coloridos (origem verde, paradas vermelho) com InfoWindow ao clicar, compatível com geometrias do ORS.',
    status: 'done',
    tag: 'Mapas',
  },
  {
    id: 5,
    title: 'Otimizar melhor rota',
    desc: 'Botão dourado no planejamento que reordena os destinos via TSP (vizinho mais próximo + 2-opt) e recalcula distâncias automaticamente.',
    status: 'done',
    tag: 'Planejamento',
  },
  {
    id: 6,
    title: 'Carga resumo — % por parada',
    desc: 'API de carga agora inclui % de peso, % de volume e % de frete por parada, exibidos na tela de detalhe do planejamento.',
    status: 'done',
    tag: 'Planejamento',
  },
  {
    id: 7,
    title: 'Planejamento — Filtro UF multi-select',
    desc: 'Dropdown com checkboxes para selecionar múltiplas UFs simultaneamente na listagem do pátio dentro do planejamento.',
    status: 'done',
    tag: 'Planejamento',
  },
  {
    id: 8,
    title: 'Layout de carga — 3 visões por andar',
    desc: 'Visualização do caminhão em 3 camadas: Assoalho, 1° Andar e 2° Andar. Cada visão mostra a planta baixa dos itens naquele nível de altura.',
    status: 'done',
    tag: 'Carga',
  },
  {
    id: 9,
    title: 'Exportação Excel profissional',
    desc: 'Todos os exports CSV convertidos para Excel (.xls) com identidade visual da BR Transportes: cabeçalho verde, título dourado, zebra, totais e rodapé.',
    status: 'done',
    tag: 'Exportação',
  },
  {
    id: 10,
    title: 'Checklist de carregamento — Salvar e travar',
    desc: 'Botão "Finalizar e Salvar Checklist" que trava edição (só admin reabre). Identidade visual verde da BR Transportes, barra de progresso e conferente.',
    status: 'done',
    tag: 'Carregamento',
  },
  {
    id: 11,
    title: 'Frete cliente — % e valor fixo',
    desc: 'Toggle R$/% no formulário de criação de coleta. Se % selecionado, calcula automaticamente sobre o valor dos itens e mostra preview em tempo real.',
    status: 'done',
    tag: 'Coletas',
  },
  {
    id: 12,
    title: 'Status "Em Carga"',
    desc: 'Status intermediário EM_CARGA adicionado ao enum e aos mapas de cores/labels em todas as telas (Home, Pátio, Etiquetas, Relatórios, Entregas).',
    status: 'done',
    tag: 'Status',
  },
  {
    id: 13,
    title: 'Entregas — Localização diária do motorista',
    desc: 'Seção "Localização dos Motoristas" nas telas de Entregas e Operação: registra onde cada motorista está a cada dia com observação.',
    status: 'done',
    tag: 'Entregas',
  },
  {
    id: 14,
    title: 'Cadastro de Produtos — Preço unitário',
    desc: 'Campo precoUnitario editável no cadastro de produto. Usado no cálculo automático do valor total dos itens na criação de coleta.',
    status: 'done',
    tag: 'Produtos',
  },
  {
    id: 15,
    title: 'Cadastro de Motoristas — Upload CNH',
    desc: 'Upload de CNH com data de vencimento e alerta visual automático (vermelho = vencida, laranja = próxima do vencimento).',
    status: 'done',
    tag: 'Motoristas',
  },
  {
    id: 16,
    title: 'Coleta — Vínculo obrigatório com NF e produtos',
    desc: 'NF obrigatória na criação de coleta. Aviso de confirmação se nenhum produto for vinculado antes de salvar.',
    status: 'done',
    tag: 'Coletas',
  },
  {
    id: 17,
    title: 'Operação — Título origem/destino + localização',
    desc: 'Tela de Operação mostra "Origem → Destino (+N paradas)" no cabeçalho de cada rota e tabela de localização dos motoristas integrada.',
    status: 'done',
    tag: 'Operação',
  },
  {
    id: 18,
    title: 'Relatórios — Detalhado por cliente',
    desc: 'Aba "Por Cliente" com cards expansíveis: clique para ver todas as NFs do cliente com status, peso, frete e lead time individuais.',
    status: 'done',
    tag: 'Relatórios',
  },
  {
    id: 19,
    title: 'Minutas — Integração com formato Excel atual',
    desc: 'Adaptar o módulo de minutas ao formato Excel que a equipe já utiliza atualmente. Aguardando envio do modelo pelo cliente.',
    status: 'pending',
    tag: 'Minutas',
  },
];

const TAG_COLORS: Record<string, string> = {
  Veículos: '#0891b2',
  Relatórios: '#7c3aed',
  Coletas: '#d97706',
  Mapas: '#0d9488',
  Planejamento: '#2563eb',
  Carga: '#ea580c',
  Carregamento: '#059669',
  Exportação: '#6366f1',
  Status: '#94a3b8',
  Entregas: '#db2777',
  Produtos: '#65a30d',
  Motoristas: '#c026d3',
  Operação: '#0284c7',
  Minutas: '#b45309',
};

const STATUS_CONFIG: Record<StatusType, { label: string; bg: string; color: string; icon: string }> = {
  done:     { label: 'Concluído',   bg: '#14532d', color: '#4ade80', icon: '✓' },
  progress: { label: 'Em progresso', bg: '#1e3a5f', color: '#60a5fa', icon: '◐' },
  pending:  { label: 'Pendente',    bg: '#1c1c1c', color: '#71717a', icon: '○' },
};

function statusCounts() {
  const done = ITEMS.filter((i) => i.status === 'done').length;
  const progress = ITEMS.filter((i) => i.status === 'progress').length;
  const pending = ITEMS.filter((i) => i.status === 'pending').length;
  return { done, progress, pending, total: ITEMS.length };
}

export default function HomologacaoPage() {
  const counts = statusCounts();
  const pct = Math.round((counts.done / counts.total) * 100);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#f1f5f9',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      padding: '32px 24px',
    }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: '#22c55e', boxShadow: '0 0 8px #22c55e',
            }} />
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>
              BR Transportes · Sistema de Gestão
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0, color: '#f8fafc', letterSpacing: '-0.5px' }}>
            Homologação V2 — Modificações
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
            Acompanhamento das melhorias solicitadas durante a homologação do sistema.
          </p>
        </div>

        {/* Progress summary */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          marginBottom: 28,
        }}>
          <StatCard value={String(counts.done)} label="Concluídos" color="#22c55e" />
          <StatCard value={String(counts.progress)} label="Em progresso" color="#60a5fa" />
          <StatCard value={String(counts.pending)} label="Pendentes" color="#71717a" />
          <StatCard value={`${pct}%`} label="Progresso geral" color="#F5BE16" />
        </div>

        {/* Progress bar */}
        <div style={{
          height: 6, borderRadius: 999, background: '#1e1e1e',
          marginBottom: 28, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: 'linear-gradient(90deg, #1A4A1A, #22c55e)',
            borderRadius: 999,
            transition: 'width 0.6s ease',
          }} />
        </div>

        {/* Table */}
        <div style={{
          border: '1px solid #1e1e1e',
          borderRadius: 12,
          overflow: 'hidden',
          background: '#111111',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '48px 1fr 130px',
            padding: '10px 20px',
            borderBottom: '1px solid #1e1e1e',
            background: '#161616',
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px' }}>#</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Modificação</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'right' }}>Status</span>
          </div>

          {/* Rows */}
          {ITEMS.map((item, idx) => {
            const sc = STATUS_CONFIG[item.status];
            const tagColor = TAG_COLORS[item.tag || ''] || '#64748b';
            const isLast = idx === ITEMS.length - 1;
            return (
              <div
                key={item.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '48px 1fr 130px',
                  padding: '14px 20px',
                  borderBottom: isLast ? 'none' : '1px solid #1a1a1a',
                  alignItems: 'start',
                  gap: 8,
                  background: item.status === 'done' ? '#0d1a0d' : item.status === 'progress' ? '#0d1220' : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                {/* Number */}
                <div style={{
                  fontSize: 13, fontWeight: 800,
                  color: item.status === 'done' ? '#22c55e33' : '#27272a',
                  paddingTop: 2,
                }}>
                  {String(item.id).padStart(2, '0')}
                </div>

                {/* Content */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{
                      fontSize: 14, fontWeight: 700,
                      color: item.status === 'done' ? '#e2e8f0' : item.status === 'progress' ? '#bfdbfe' : '#94a3b8',
                    }}>
                      {item.title}
                    </span>
                    {item.tag && (
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        padding: '1px 7px',
                        borderRadius: 999,
                        background: tagColor + '22',
                        color: tagColor,
                        border: `1px solid ${tagColor}44`,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}>
                        {item.tag}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                    {item.desc}
                  </div>
                </div>

                {/* Status badge */}
                <div style={{ textAlign: 'right', paddingTop: 2 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 11, fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: sc.bg,
                    color: sc.color,
                    border: `1px solid ${sc.color}44`,
                    whiteSpace: 'nowrap',
                  }}>
                    <span style={{ fontSize: 14, lineHeight: 1 }}>{sc.icon}</span>
                    {sc.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 24, fontSize: 11, color: '#334155', textAlign: 'center' }}>
          BR Transportes e Logística · Homologação iniciada em 28/03/2026
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatCard({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div style={{
      background: '#111111',
      border: '1px solid #1e1e1e',
      borderRadius: 10,
      padding: '14px 16px',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 24, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </div>
    </div>
  );
}
