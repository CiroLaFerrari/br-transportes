'use client';

// ─────────────────────────────────────────────────────────────────────────────
// /homologacao — Painel de acompanhamento das modificações solicitadas
// Identidade visual BR Transportes (verde #1A4A1A, dourado #F5BE16, branco)
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
    desc: 'Campo Marca adicionado à minuta. Colunas Endereço e Embarque nos volumes (igual ao modelo BKP_MINUTA). Exportação Excel (.xlsx) fiel ao template: cabeçalho verde, grade QTDE/ITEM/MEDIDAS/ENDEREÇO/EMBARQUE, totais e aba DECLARAÇÃO. Impressão HTML reformulada no mesmo layout.',
    status: 'done',
    tag: 'Minutas',
  },
  {
    id: 20,
    title: 'Importação de NF-e via PDF (DANFE)',
    desc: 'Nova aba "Upload PDF" na tela de NF-e: arraste ou selecione o DANFE em PDF. O sistema extrai emitente, CNPJ, destinatário, chave de acesso, produtos, pesos e valor total diretamente do arquivo — sem API paga, sem e-CNPJ. Aba "Chave de acesso" mantida para consulta futura com provedor externo.',
    status: 'done',
    tag: 'NF-e',
  },
  {
    id: 21,
    title: 'Entregas — Filtro "Todos os status" como padrão',
    desc: 'Tela de Entregas agora abre com "Todos os status" por padrão, exibindo coletas em qualquer fase (Pátio, Em Carga, Carregada, Em Trânsito, Entregue). Antes travava em EM_PATIO, ocultando tudo que já foi entregue.',
    status: 'done',
    tag: 'Entregas',
  },
  {
    id: 22,
    title: 'Planejamento — Descrição dos produtos nas paradas',
    desc: 'Tabela de paradas no planejamento exibe coluna "Produtos" com a descrição de cada item vinculado à coleta (ex: CONDOR M.12 PULVERIZADOR | RESERVATÓRIO 600L), facilitando a conferência sem abrir cada NF.',
    status: 'done',
    tag: 'Planejamento',
  },
  {
    id: 23,
    title: 'Checklist Carregamento — Excel XLSX real',
    desc: 'Botão "Baixar Excel" no Checklist de Carregamento agora gera um .xlsx real via ExcelJS (cabeçalho verde, zebra, auto-filtro, linha congelada). Antes gerava HTML disfarçado de .xls que o Excel 2016+ recusava abrir.',
    status: 'done',
    tag: 'Carregamento',
  },
];

const TAG_COLORS: Record<string, string> = {
  Veículos:     '#0891b2',
  Relatórios:   '#7c3aed',
  Coletas:      '#d97706',
  Mapas:        '#0d9488',
  Planejamento: '#2563eb',
  Carga:        '#ea580c',
  Carregamento: '#059669',
  Exportação:   '#6366f1',
  Status:       '#64748b',
  Entregas:     '#db2777',
  Produtos:     '#65a30d',
  Motoristas:   '#c026d3',
  Operação:     '#0284c7',
  Minutas:      '#b45309',
  'NF-e':       '#0f766e',
};

const STATUS_CONFIG: Record<StatusType, { label: string; bg: string; color: string; border: string; icon: string }> = {
  done:     { label: 'Concluído',    bg: '#dcfce7', color: '#15803d', border: '#86efac', icon: '✓' },
  progress: { label: 'Em progresso', bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd', icon: '◐' },
  pending:  { label: 'Pendente',     bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1', icon: '○' },
};

function statusCounts() {
  const done     = ITEMS.filter((i) => i.status === 'done').length;
  const progress = ITEMS.filter((i) => i.status === 'progress').length;
  const pending  = ITEMS.filter((i) => i.status === 'pending').length;
  return { done, progress, pending, total: ITEMS.length };
}

export default function HomologacaoPage() {
  const counts = statusCounts();
  const pct    = Math.round((counts.done / counts.total) * 100);

  const GREEN  = '#1A4A1A';
  const GOLD   = '#F5BE16';
  const LIGHT  = '#f0fdf4';
  const BORDER = '#d1fae5';

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      color: '#1e293b',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      padding: '32px 24px',
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: 14, color: GOLD, flexShrink: 0,
            }}>
              BR
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>
                BR Transportes · Sistema de Gestão
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, color: GREEN, letterSpacing: '-0.3px' }}>
                Homologação V2 — Modificações
              </h1>
            </div>
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0, paddingLeft: 48 }}>
            Acompanhamento das melhorias solicitadas durante a homologação do sistema.
          </p>
        </div>

        {/* Stat cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}>
          <StatCard value={String(counts.done)}     label="Concluídos"    color={GREEN} bg={LIGHT}   border={BORDER} />
          <StatCard value={String(counts.progress)} label="Em progresso"  color="#1d4ed8" bg="#eff6ff" border="#bfdbfe" />
          <StatCard value={String(counts.pending)}  label="Pendentes"     color="#64748b" bg="#f8fafc" border="#e2e8f0" />
          <StatCard value={`${pct}%`}               label="Progresso"     color={GOLD}   bg={GREEN}   border={GREEN} textWhite />
        </div>

        {/* Barra de progresso */}
        <div style={{ height: 8, borderRadius: 999, background: '#e2e8f0', marginBottom: 24, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: `linear-gradient(90deg, ${GREEN}, #2d7a2d)`,
            borderRadius: 999,
            transition: 'width 0.6s ease',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
              width: 16, height: 16, borderRadius: '50%',
              background: GOLD, border: `2px solid ${GREEN}`,
              boxShadow: `0 0 6px ${GOLD}`,
            }} />
          </div>
        </div>

        {/* Tabela */}
        <div style={{
          border: `1px solid ${BORDER}`,
          borderRadius: 14,
          overflow: 'hidden',
          background: '#ffffff',
          boxShadow: '0 1px 4px rgba(26,74,26,0.07)',
        }}>
          {/* Cabeçalho da tabela */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '52px 1fr 130px',
            padding: '10px 20px',
            borderBottom: `2px solid ${GOLD}`,
            background: GREEN,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(245,190,22,0.8)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>#</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(245,190,22,0.8)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Modificação</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(245,190,22,0.8)', textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'right' }}>Status</span>
          </div>

          {/* Linhas */}
          {ITEMS.map((item, idx) => {
            const sc       = STATUS_CONFIG[item.status];
            const tagColor = TAG_COLORS[item.tag || ''] || '#64748b';
            const isLast   = idx === ITEMS.length - 1;
            const isEven   = idx % 2 === 0;

            return (
              <div
                key={item.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '52px 1fr 130px',
                  padding: '13px 20px',
                  borderBottom: isLast ? 'none' : `1px solid ${BORDER}`,
                  alignItems: 'start',
                  gap: 8,
                  background: isEven ? '#ffffff' : LIGHT,
                }}
              >
                {/* Número */}
                <div style={{
                  fontSize: 13, fontWeight: 900,
                  color: item.status === 'done' ? '#86efac' : '#cbd5e1',
                  paddingTop: 2,
                }}>
                  {String(item.id).padStart(2, '0')}
                </div>

                {/* Conteúdo */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{
                      fontSize: 14, fontWeight: 700,
                      color: item.status === 'done' ? GREEN : item.status === 'progress' ? '#1d4ed8' : '#64748b',
                    }}>
                      {item.title}
                    </span>
                    {item.tag && (
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: tagColor + '18',
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

                {/* Badge de status */}
                <div style={{ textAlign: 'right', paddingTop: 2 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 11, fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: sc.bg,
                    color: sc.color,
                    border: `1px solid ${sc.border}`,
                    whiteSpace: 'nowrap',
                  }}>
                    <span style={{ fontSize: 13, lineHeight: 1 }}>{sc.icon}</span>
                    {sc.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Rodapé */}
        <div style={{
          marginTop: 20,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 8,
        }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            BR Transportes e Logística · Homologação iniciada em 28/03/2026
          </span>
          <span style={{
            fontSize: 12, fontWeight: 700,
            padding: '4px 12px', borderRadius: 999,
            background: LIGHT, color: GREEN, border: `1px solid ${BORDER}`,
          }}>
            {counts.done}/{counts.total} concluídos · {pct}%
          </span>
        </div>

      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatCard({
  value, label, color, bg, border, textWhite,
}: {
  value: string; label: string; color: string; bg: string; border: string; textWhite?: boolean;
}) {
  return (
    <div style={{
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 10,
      padding: '14px 16px',
      borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{
        fontSize: 11, marginTop: 4, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.5px',
        color: textWhite ? 'rgba(255,255,255,0.8)' : '#64748b',
      }}>
        {label}
      </div>
    </div>
  );
}
