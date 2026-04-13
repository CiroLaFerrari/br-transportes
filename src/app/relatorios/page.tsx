'use client';
import { useEffect, useMemo, useState } from 'react';

// ====== Types ======

type Stop = { id: string; order: number; destination: string; km: number; durMin: number };
type Route = { id: string; createdAt: string; origin: string; totalKm: number; stops: Stop[] };
type RotasReport = {
  period: { from: string; to_inclusive: string };
  totals: { routes: number; km: number; cost: number; costPerKm: number | null };
  data: Route[];
};

type PatioColeta = {
  id: string;
  nf: string;
  cidade: string;
  uf: string;
  status: string;
  cliente: string;
  cnpj: string | null;
  pesoTotalKg: number | null;
  valorFrete: number | null;
  entradaPatioAt: string | null;
  fimPatioAt: string | null;
  aberto: boolean;
  leadTimeDias: number | null;
};

type PatioReport = {
  ok: boolean;
  periodo: { dateFrom: string | null; dateTo: string | null; statusFilter: string };
  metricas: {
    totalColetas: number;
    coletasAberto: number;
    coletasFechado: number;
    mediaDias: number | null;
    maxDias: number | null;
    minDias: number | null;
    pesoTotal: number;
    freteTotal: number;
  };
  faixas: { ate3: number; ate7: number; ate15: number; acima15: number };
  analiseUf: Array<{ uf: string; count: number; mediaDias: number; maxDias: number }>;
  analiseCliente: Array<{ cliente: string; cnpj: string | null; count: number; mediaDias: number; maxDias: number; valorFrete: number }>;
  coletas: PatioColeta[];
};

type Tab = 'rotas' | 'patio';

// ====== Helpers ======

function fmtDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

const fmt = Intl.NumberFormat('pt-BR');
const fmtDec = Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const fmtBRL = Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function downloadExcel(filename: string, headers: string[], rows: string[][], options?: { title?: string; subtitle?: string }) {
  const esc = (v: string) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colCount = headers.length;
  const today = new Date().toLocaleDateString('pt-BR');
  const title = options?.title || 'Relatório BR Transportes';
  const subtitle = options?.subtitle || '';

  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<!--[if gte mso 9]><xml>
<x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>Relatório</x:Name>
<x:WorksheetOptions><x:FreezePanes/><x:FrozenNoSplit/><x:SplitHorizontal>${subtitle ? 5 : 4}</x:SplitHorizontal><x:TopRowBottomPane>${subtitle ? 5 : 4}</x:TopRowBottomPane></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook>
</xml><![endif]-->
<style>
  body { font-family: Calibri, Arial, sans-serif; }
  td, th { mso-number-format:\\@; }
</style>
</head>
<body>
<table border="0" cellpadding="0" cellspacing="0">`;

  // Row 1: Company branding header — dark green bar with company name
  html += `<tr style="height:36pt">
    <td colspan="${colCount}" style="background:#1A4A1A;color:#FFFFFF;font-size:18pt;font-weight:bold;padding:8px 12px;border:none;font-family:Calibri,Arial,sans-serif;letter-spacing:1px">
      BR Transportes e Logística
    </td>
  </tr>`;

  // Row 2: Report title — gold accent bar
  html += `<tr style="height:28pt">
    <td colspan="${colCount}" style="background:#F5BE16;color:#1A4A1A;font-size:13pt;font-weight:bold;padding:6px 12px;border:none;font-family:Calibri,Arial,sans-serif">
      ${esc(title)}
    </td>
  </tr>`;

  // Row 3: Subtitle / date info
  if (subtitle) {
    html += `<tr style="height:20pt">
      <td colspan="${colCount}" style="background:#f0fdf0;color:#475569;font-size:10pt;padding:4px 12px;border-bottom:1px solid #d1d5db;font-family:Calibri,Arial,sans-serif">
        ${esc(subtitle)} &nbsp;|&nbsp; Gerado em: ${today}
      </td>
    </tr>`;
  } else {
    html += `<tr style="height:20pt">
      <td colspan="${colCount}" style="background:#f0fdf0;color:#475569;font-size:10pt;padding:4px 12px;border-bottom:1px solid #d1d5db;font-family:Calibri,Arial,sans-serif">
        Gerado em: ${today}
      </td>
    </tr>`;
  }

  // Column headers — dark green background, white bold text, uppercase
  html += '<tr style="height:24pt">';
  for (const h of headers) {
    const isNumeric = /peso|frete|valor|km|min|dias|coletas|máx|méd/i.test(h);
    html += `<th style="background:#1A4A1A;color:#FFFFFF;font-weight:bold;font-size:10pt;padding:6px 10px;border:1px solid #0d2d0d;text-align:${isNumeric ? 'right' : 'left'};text-transform:uppercase;letter-spacing:0.5px;font-family:Calibri,Arial,sans-serif;white-space:nowrap">
      ${esc(h)}
    </th>`;
  }
  html += '</tr>';

  // Data rows — zebra striping with light green/white
  for (let r = 0; r < rows.length; r++) {
    const bg = r % 2 === 0 ? '#FFFFFF' : '#f0fdf4';
    html += `<tr style="height:18pt">`;
    for (let c = 0; c < rows[r].length; c++) {
      const v = rows[r][c];
      const hdr = headers[c] || '';
      const isNumeric = /peso|frete|valor|km|min|dias|coletas|máx|méd/i.test(hdr);
      const isCurrency = /frete|valor/i.test(hdr);
      const isStatus = /status/i.test(hdr);

      // Status color coding
      let extraStyle = '';
      if (isStatus) {
        const vUp = v.toUpperCase();
        if (vUp.includes('ENTREGUE') || vUp === 'NÃO') extraStyle = 'color:#16a34a;font-weight:bold;';
        else if (vUp.includes('TRANSITO') || vUp.includes('CARGA')) extraStyle = 'color:#d97706;font-weight:bold;';
        else if (vUp.includes('PATIO') || vUp === 'SIM') extraStyle = 'color:#dc2626;font-weight:bold;';
      }

      // Lead time color coding (red if > 15, orange if > 7)
      if (/lead.*dias|média.*dias/i.test(hdr)) {
        const numVal = parseFloat(v.replace(',', '.'));
        if (!isNaN(numVal)) {
          if (numVal > 15) extraStyle = 'color:#dc2626;font-weight:bold;';
          else if (numVal > 7) extraStyle = 'color:#d97706;font-weight:bold;';
          else extraStyle = 'color:#16a34a;font-weight:bold;';
        }
      }

      // Currency formatting
      if (isCurrency) extraStyle += 'mso-number-format:"R\\$ \\#\\,\\#\\#0\\.00";';

      html += `<td style="background:${bg};padding:5px 10px;border:1px solid #e2e8f0;font-size:10pt;text-align:${isNumeric ? 'right' : 'left'};color:#1e293b;font-family:Calibri,Arial,sans-serif;vertical-align:middle;${extraStyle}">
        ${esc(v)}
      </td>`;
    }
    html += '</tr>';
  }

  // Totals/summary row if applicable — count numeric columns
  if (rows.length > 1) {
    html += `<tr style="height:22pt">`;
    for (let c = 0; c < headers.length; c++) {
      const hdr = headers[c] || '';
      const isSummable = /peso|frete|valor|coletas/i.test(hdr);
      if (c === 0) {
        html += `<td style="background:#1A4A1A;color:#FFFFFF;font-weight:bold;font-size:10pt;padding:6px 10px;border:1px solid #0d2d0d;font-family:Calibri,Arial,sans-serif">
          TOTAL (${rows.length} registros)
        </td>`;
      } else if (isSummable) {
        let sum = 0;
        let hasVal = false;
        for (const row of rows) {
          const raw = (row[c] || '').replace(/[R$\s.]/g, '').replace(',', '.');
          const n = parseFloat(raw);
          if (!isNaN(n)) { sum += n; hasVal = true; }
        }
        const display = hasVal ? sum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
        html += `<td style="background:#1A4A1A;color:#F5BE16;font-weight:bold;font-size:10pt;padding:6px 10px;border:1px solid #0d2d0d;text-align:right;font-family:Calibri,Arial,sans-serif">
          ${esc(display)}
        </td>`;
      } else {
        html += `<td style="background:#1A4A1A;border:1px solid #0d2d0d"></td>`;
      }
    }
    html += '</tr>';
  }

  // Footer row
  html += `<tr><td colspan="${colCount}" style="font-size:8pt;color:#94a3b8;padding:8px 12px;border:none;font-family:Calibri,Arial,sans-serif">
    BR Transportes e Logística — Sistema de Planejamento de Entregas — ${today}
  </td></tr>`;

  html += '</table></body></html>';

  const xlsName = filename.replace(/\.(csv|xls)$/i, '.xls');
  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = xlsName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fmtDateBR(dateStr: string | null) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
}

// ====== Main Page ======

export default function RelatoriosPage() {
  const [tab, setTab] = useState<Tab>('patio');

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      style={{
        padding: '10px 20px',
        borderRadius: '8px 8px 0 0',
        border: '1px solid #e2e8f0',
        borderBottom: tab === t ? '2px solid #2563eb' : '1px solid #e2e8f0',
        background: tab === t ? '#fff' : '#f8fafc',
        color: tab === t ? '#0f172a' : '#64748b',
        fontWeight: tab === t ? 700 : 500,
        fontSize: 14,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>Relatórios</h1>

      <div style={{ display: 'flex', gap: 4, marginBottom: 0 }}>
        {tabBtn('patio', 'Lead Time Pátio')}
        {tabBtn('rotas', 'Rotas')}
      </div>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '0 8px 8px 8px', background: '#fff', padding: 20 }}>
        {tab === 'rotas' && <RotasTab />}
        {tab === 'patio' && <PatioTab />}
      </div>
    </main>
  );
}

// ====== Rotas Tab (preserved) ======

function RotasTab() {
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(fmtDateInput(today));
  const [dateTo, setDateTo] = useState(fmtDateInput(today));
  const [costPerKm, setCostPerKm] = useState('');
  const [report, setReport] = useState<RotasReport | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function carregar() {
    setErro(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo });
      if (costPerKm.trim()) params.set('costPerKm', costPerKm.trim());
      const r = await fetch(`/api/relatorios/rotas?${params.toString()}`, { cache: 'no-store' });
      if (!r.ok) {
        const e = await r.json().catch(() => ({ error: 'Erro ao carregar relatório' }));
        throw new Error((e as any).error || 'Erro ao carregar relatório');
      }
      setReport((await r.json()) as RotasReport);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar relatório');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const xlsxHref = (() => {
    const p = new URLSearchParams({ dateFrom, dateTo });
    if (costPerKm.trim()) p.set('costPerKm', costPerKm.trim());
    return `/api/relatorios/rotas.xlsx?${p.toString()}`;
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label>
          <div style={labelStyle}>De</div>
          <input type="date" style={inputStyle} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label>
          <div style={labelStyle}>Até</div>
          <input type="date" style={inputStyle} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <label>
          <div style={labelStyle}>Custo por km (R$) — opcional</div>
          <input style={{ ...inputStyle, width: 160 }} placeholder="ex.: 2.75" value={costPerKm} onChange={(e) => setCostPerKm(e.target.value)} />
        </label>
        <button onClick={carregar} disabled={loading} style={btnPrimary}>
          {loading ? 'Carregando...' : 'Filtrar'}
        </button>
        <a href={xlsxHref} style={btnOutline}>Exportar Excel</a>
      </div>

      {erro && <div style={{ color: '#dc2626', fontSize: 13 }}>{erro}</div>}

      {report && (
        <>
          <div style={{ fontSize: 13, color: '#475569' }}>
            Período: <b>{new Date(report.period.from).toLocaleDateString('pt-BR')}</b> a{' '}
            <b>{new Date(report.period.to_inclusive).toLocaleDateString('pt-BR')}</b>
          </div>
          <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
            <span><b>Rotas:</b> {report.totals.routes}</span>
            <span><b>Total km:</b> {report.totals.km}</span>
            {report.totals.costPerKm && (
              <span>
                <b>Custo estimado:</b> R$ {report.totals.cost.toFixed(2)}{' '}
                <span style={{ color: '#94a3b8' }}>(R$ {report.totals.costPerKm.toFixed(2)}/km)</span>
              </span>
            )}
          </div>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={thStyle}>Data/Hora</th>
                <th style={thStyle}>Origem</th>
                <th style={thStyle}>Paradas</th>
                <th style={thStyle}>Total km</th>
                <th style={thStyle}>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {report.data.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={tdStyle}>{new Date(r.createdAt).toLocaleString('pt-BR')}</td>
                  <td style={tdStyle}>{r.origin}</td>
                  <td style={tdStyle}>{r.stops.length}</td>
                  <td style={tdStyle}>{r.totalKm}</td>
                  <td style={tdStyle}>
                    <a href={`/rotas/${r.id}/mapa`} style={{ color: '#2563eb', textDecoration: 'underline' }}>Ver no mapa</a>
                  </td>
                </tr>
              ))}
              {report.data.length === 0 && (
                <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}>Sem rotas neste período.</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ====== Patio / Lead Time Tab ======

function PatioTab() {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [dateFrom, setDateFrom] = useState(fmtDateInput(thirtyDaysAgo));
  const [dateTo, setDateTo] = useState(fmtDateInput(today));
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [report, setReport] = useState<PatioReport | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [subTab, setSubTab] = useState<'metricas' | 'coletas' | 'uf' | 'clientes'>('metricas');

  async function carregar() {
    setErro(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo, status: statusFilter });
      const r = await fetch(`/api/relatorios/patio?${params.toString()}`, { cache: 'no-store' });
      if (!r.ok) {
        const e = await r.json().catch(() => ({ error: 'Erro ao carregar' }));
        throw new Error((e as any).error || 'Erro ao carregar');
      }
      const j = await r.json();
      if (!j.ok) throw new Error('Resposta inválida');
      setReport(j as PatioReport);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const m = report?.metricas;
  const faixas = report?.faixas;

  const faixaTotal = faixas ? faixas.ate3 + faixas.ate7 + faixas.ate15 + faixas.acima15 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label>
          <div style={labelStyle}>De</div>
          <input type="date" style={inputStyle} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label>
          <div style={labelStyle}>Até</div>
          <input type="date" style={inputStyle} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <label>
          <div style={labelStyle}>Status</div>
          <select style={{ ...inputStyle, width: 160 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">Todos</option>
            <option value="EM_PATIO">EM_PATIO</option>
            <option value="EM_CARGA">EM_CARGA</option>
            <option value="CARREGADA">CARREGADA</option>
            <option value="EM_TRANSITO">EM_TRANSITO</option>
            <option value="ENTREGUE">ENTREGUE</option>
          </select>
        </label>
        <button onClick={carregar} disabled={loading} style={btnPrimary}>
          {loading ? 'Carregando...' : 'Filtrar'}
        </button>
        {report && (
          <button
            style={btnOutline}
            onClick={() => {
              const headers = ['NF', 'Cliente', 'CNPJ', 'Cidade', 'UF', 'Status', 'Aberto', 'Peso (kg)', 'Valor Frete', 'Data Entrada Pátio', 'Data Saída Pátio', 'Lead Time (dias)'];
              const rows = report.coletas.map((c) => [
                c.nf,
                c.cliente,
                c.cnpj || '-',
                c.cidade,
                c.uf,
                c.status,
                c.aberto ? 'Sim' : 'Não',
                c.pesoTotalKg != null ? String(c.pesoTotalKg) : '',
                c.valorFrete != null ? String(c.valorFrete) : '',
                fmtDateBR(c.entradaPatioAt),
                fmtDateBR(c.fimPatioAt),
                c.leadTimeDias != null ? String(c.leadTimeDias) : '',
              ]);
              downloadExcel(`relatorio_detalhado_${dateFrom}_${dateTo}.xls`, headers, rows, {
                title: 'Relatório Detalhado — Lead Time de Pátio',
                subtitle: `Período: ${fmtDateBR(dateFrom)} a ${fmtDateBR(dateTo)} | Filtro: ${statusFilter === 'ALL' ? 'Todos' : statusFilter}`,
              });
            }}
          >
            Exportar Detalhado Excel
          </button>
        )}
      </div>

      {erro && <div style={{ color: '#dc2626', fontSize: 13 }}>{erro}</div>}

      {report && m && faixas && (
        <>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <MetricCard label="Total Coletas" value={String(m.totalColetas)} color="#3b82f6" />
            <MetricCard label="Ainda em Pátio" value={String(m.coletasAberto)} color="#f59e0b" />
            <MetricCard label="Finalizadas" value={String(m.coletasFechado)} color="#22c55e" />
            <MetricCard
              label="Lead Time Médio"
              value={m.mediaDias != null ? `${fmtDec.format(m.mediaDias)} dias` : '—'}
              color={m.mediaDias != null && m.mediaDias > 15 ? '#dc2626' : m.mediaDias != null && m.mediaDias > 7 ? '#f59e0b' : '#16a34a'}
            />
            <MetricCard label="Lead Time Máx" value={m.maxDias != null ? `${fmtDec.format(m.maxDias)} dias` : '—'} color="#dc2626" />
            <MetricCard label="Lead Time Mín" value={m.minDias != null ? `${fmtDec.format(m.minDias)} dias` : '—'} color="#16a34a" />
            <MetricCard label="Peso Total" value={`${fmt.format(m.pesoTotal)} kg`} color="#6366f1" />
            <MetricCard label="Frete Total" value={fmtBRL.format(m.freteTotal)} color="#0ea5e9" />
          </div>

          {/* Distribution bar */}
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>Distribuição por Faixa de Lead Time</div>
            {faixaTotal > 0 ? (
              <>
                <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
                  <FaixaBar value={faixas.ate3} total={faixaTotal} color="#22c55e" />
                  <FaixaBar value={faixas.ate7} total={faixaTotal} color="#84cc16" />
                  <FaixaBar value={faixas.ate15} total={faixaTotal} color="#f59e0b" />
                  <FaixaBar value={faixas.acima15} total={faixaTotal} color="#dc2626" />
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
                  <FaixaLegend label="≤ 3 dias" value={faixas.ate3} color="#22c55e" />
                  <FaixaLegend label="4–7 dias" value={faixas.ate7} color="#84cc16" />
                  <FaixaLegend label="8–15 dias" value={faixas.ate15} color="#f59e0b" />
                  <FaixaLegend label="> 15 dias" value={faixas.acima15} color="#dc2626" />
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>Sem dados para exibir distribuição.</div>
            )}
          </div>

          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['metricas', 'coletas', 'uf', 'clientes'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setSubTab(st)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: subTab === st ? '1px solid #2563eb' : '1px solid #e2e8f0',
                  background: subTab === st ? '#eff6ff' : '#fff',
                  color: subTab === st ? '#1d4ed8' : '#64748b',
                  fontWeight: subTab === st ? 700 : 500,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {{ metricas: 'Resumo', coletas: 'Coletas', uf: 'Por UF', clientes: 'Por Cliente' }[st]}
              </button>
            ))}
          </div>

          {subTab === 'metricas' && <PatioResumo report={report} />}
          {subTab === 'coletas' && <PatioColetas coletas={report.coletas} />}
          {subTab === 'uf' && <PatioUf data={report.analiseUf} />}
          {subTab === 'clientes' && <PatioClientes data={report.analiseCliente} coletas={report.coletas} dateFrom={dateFrom} dateTo={dateTo} />}
        </>
      )}
    </div>
  );
}

// ====== Patio Sub-components ======

function PatioResumo({ report }: { report: PatioReport }) {
  const m = report.metricas;
  return (
    <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.8 }}>
      <p>
        No período selecionado, foram registradas <b>{m.totalColetas}</b> coletas.
        Destas, <b>{m.coletasAberto}</b> ainda estão em pátio e <b>{m.coletasFechado}</b> já saíram.
      </p>
      {m.mediaDias != null && (
        <p>
          O lead time médio de permanência no pátio é de <b>{fmtDec.format(m.mediaDias)} dias</b>,
          com máximo de <b>{m.maxDias != null ? fmtDec.format(m.maxDias) : '—'} dias</b> e
          mínimo de <b>{m.minDias != null ? fmtDec.format(m.minDias) : '—'} dias</b>.
        </p>
      )}
      <p>
        Peso total: <b>{fmt.format(m.pesoTotal)} kg</b> | Frete total: <b>{fmtBRL.format(m.freteTotal)}</b>
      </p>
    </div>
  );
}

function PatioColetas({ coletas }: { coletas: PatioColeta[] }) {
  const [sortBy, setSortBy] = useState<'lead' | 'nf' | 'uf'>('lead');

  const sorted = useMemo(() => {
    const arr = [...coletas];
    if (sortBy === 'lead') arr.sort((a, b) => (b.leadTimeDias ?? -1) - (a.leadTimeDias ?? -1));
    else if (sortBy === 'nf') arr.sort((a, b) => a.nf.localeCompare(b.nf));
    else arr.sort((a, b) => a.uf.localeCompare(b.uf));
    return arr;
  }, [coletas, sortBy]);

  return (
    <div>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>Ordenar por:</span>
        {(['lead', 'nf', 'uf'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            style={{
              padding: '3px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
              background: sortBy === s ? '#1e40af' : '#f1f5f9',
              color: sortBy === s ? '#fff' : '#475569',
              border: 'none', fontWeight: 600,
            }}
          >
            {{ lead: 'Lead Time', nf: 'NF', uf: 'UF' }[s]}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>{sorted.length} coletas</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={thStyle}>NF</th>
              <th style={thStyle}>Cliente</th>
              <th style={thStyle}>CNPJ</th>
              <th style={thStyle}>Cidade/UF</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Peso (kg)</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Frete</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Lead Time</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ ...tdStyle, fontWeight: 700 }}>
                  <a href={`/coletas/${c.id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{c.nf}</a>
                </td>
                <td style={tdStyle}>{c.cliente}</td>
                <td style={tdStyle}>{c.cnpj || '-'}</td>
                <td style={tdStyle}>{c.cidade}/{c.uf}</td>
                <td style={tdStyle}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, color: '#fff',
                    background: statusColor(c.status),
                  }}>
                    {c.status}{c.aberto ? ' (aberto)' : ''}
                  </span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{c.pesoTotalKg != null ? fmt.format(c.pesoTotalKg) : '—'}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{c.valorFrete != null ? fmtBRL.format(c.valorFrete) : '—'}</td>
                <td style={{
                  ...tdStyle, textAlign: 'right', fontWeight: 700,
                  color: c.leadTimeDias != null && c.leadTimeDias > 15 ? '#dc2626' : c.leadTimeDias != null && c.leadTimeDias > 7 ? '#f59e0b' : '#334155',
                }}>
                  {c.leadTimeDias != null ? `${fmtDec.format(c.leadTimeDias)}d` : '—'}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}>Sem coletas no período.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PatioUf({ data }: { data: PatioReport['analiseUf'] }) {
  return (
    <table style={tableStyle}>
      <thead>
        <tr style={{ background: '#f8fafc' }}>
          <th style={thStyle}>UF</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Coletas</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Média (dias)</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Máx (dias)</th>
          <th style={thStyle}>Barra</th>
        </tr>
      </thead>
      <tbody>
        {data.map((r) => {
          const maxAll = data.reduce((m, x) => Math.max(m, x.count), 0);
          return (
            <tr key={r.uf} style={{ borderTop: '1px solid #f1f5f9' }}>
              <td style={{ ...tdStyle, fontWeight: 700 }}>{r.uf}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{r.count}</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: r.mediaDias > 15 ? '#dc2626' : r.mediaDias > 7 ? '#f59e0b' : '#334155' }}>
                {fmtDec.format(r.mediaDias)}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtDec.format(r.maxDias)}</td>
              <td style={{ ...tdStyle, width: 200 }}>
                <div style={{ height: 14, borderRadius: 4, background: '#e2e8f0', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${maxAll > 0 ? (r.count / maxAll) * 100 : 0}%`, background: '#3b82f6', borderRadius: 4 }} />
                </div>
              </td>
            </tr>
          );
        })}
        {data.length === 0 && (
          <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}>Sem dados.</td></tr>
        )}
      </tbody>
    </table>
  );
}

function PatioClientes({ data, coletas, dateFrom, dateTo }: { data: PatioReport['analiseCliente']; coletas: PatioColeta[]; dateFrom: string; dateTo: string }) {
  function exportClientExcel(clienteName: string) {
    const clienteColetas = coletas.filter((c) => c.cliente === clienteName);
    const headers = ['NF', 'Cidade', 'UF', 'Status', 'Peso (kg)', 'Valor Frete', 'Data Entrada Pátio', 'Data Saída Pátio', 'Lead Time (dias)'];
    const rows = clienteColetas.map((c) => [
      c.nf,
      c.cidade,
      c.uf,
      c.status,
      c.pesoTotalKg != null ? String(c.pesoTotalKg) : '',
      c.valorFrete != null ? String(c.valorFrete) : '',
      fmtDateBR(c.entradaPatioAt),
      fmtDateBR(c.fimPatioAt),
      c.leadTimeDias != null ? String(c.leadTimeDias) : '',
    ]);
    const safeName = clienteName.replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadExcel(`relatorio_${safeName}_${dateFrom}_${dateTo}.xls`, headers, rows, {
      title: `Relatório por Cliente — ${clienteName}`,
      subtitle: `Período: ${fmtDateBR(dateFrom)} a ${fmtDateBR(dateTo)}`,
    });
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={thStyle}>Cliente</th>
            <th style={thStyle}>CNPJ</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Coletas</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Média (dias)</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Máx (dias)</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Frete Total</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>Exportar</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={`${r.cnpj || ''}||${r.cliente}`} style={{ borderTop: '1px solid #f1f5f9' }}>
              <td style={{ ...tdStyle, fontWeight: 600 }}>{r.cliente}</td>
              <td style={tdStyle}>{r.cnpj || '-'}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{r.count}</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: r.mediaDias > 15 ? '#dc2626' : r.mediaDias > 7 ? '#f59e0b' : '#334155' }}>
                {fmtDec.format(r.mediaDias)}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtDec.format(r.maxDias)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtBRL.format(r.valorFrete)}</td>
              <td style={{ ...tdStyle, textAlign: 'center' }}>
                <button onClick={() => exportClientExcel(r.cliente)} style={{ ...btnOutline, padding: '4px 10px', fontSize: 11 }}>
                  Exportar Excel
                </button>
              </td>
            </tr>
          ))}
          {data.length === 0 && (
            <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}>Sem dados.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ====== Shared Sub-components ======

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: 14, borderRadius: 8, border: '1px solid #e2e8f0', borderLeft: `4px solid ${color}`, background: '#fff' }}>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{value}</div>
    </div>
  );
}

function FaixaBar({ value, total, color }: { value: number; total: number; color: string }) {
  if (value === 0) return null;
  const pct = (value / total) * 100;
  return (
    <div
      style={{ width: `${pct}%`, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700, minWidth: pct > 5 ? undefined : 0 }}
      title={`${value} coletas (${pct.toFixed(1)}%)`}
    >
      {pct >= 8 ? value : ''}
    </div>
  );
}

function FaixaLegend({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
      <span style={{ color: '#475569' }}>{label}: <b>{value}</b></span>
    </span>
  );
}

function statusColor(s: string) {
  const map: Record<string, string> = { EM_PATIO: '#f59e0b', EM_CARGA: '#6366f1', CARREGADA: '#3b82f6', EM_TRANSITO: '#8b5cf6', ENTREGUE: '#22c55e' };
  return map[s] || '#94a3b8';
}

// ====== Shared Styles ======

const labelStyle: React.CSSProperties = { fontSize: 12, color: '#64748b', marginBottom: 2 };
const inputStyle: React.CSSProperties = { padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, width: 140 };
const btnPrimary: React.CSSProperties = { padding: '8px 16px', borderRadius: 6, border: 'none', background: '#1A4A1A', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const btnOutline: React.CSSProperties = { padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#334155', fontWeight: 500, fontSize: 13, textDecoration: 'none', display: 'inline-block' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontWeight: 700, color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #e2e8f0' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', color: '#334155' };
