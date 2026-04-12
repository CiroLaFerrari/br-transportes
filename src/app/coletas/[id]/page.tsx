'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type Cliente = {
  id: string;
  razao: string;
  cidade?: string | null;
  uf?: string | null;
};

type Item = {
  id: string;
  quantidade: number;
  etiqueta: string | null;
  Produto?: { id: string; code: string; descricao: string; pesoKg: number | null } | null;
  volumes?: Array<{ id: string }> | null;
};

type Parada = {
  id: string;
  ordem: number;
  label: string;
  statusExec: 'PENDENTE' | 'EM_ATENDIMENTO' | 'ENTREGUE' | 'FALHA';
  checkinAt: string | null;
  checkoutAt: string | null;
  rotaId: string | null;
};

type Coleta = {
  id: string;
  nf: string;
  cidade: string;
  uf: string;
  valorFrete: number | null;
  pesoTotalKg: number | null;
  clienteId: string;

  status: 'EM_PATIO' | 'CARREGADA' | 'EM_TRANSITO' | 'ENTREGUE';

  entradaPatioAt: string;
  embarqueAt: string | null;
  fimPatioAt: string | null;

  Cliente?: Cliente | null;
  itens?: Item[] | null;
  paradas?: Parada[] | null;
};

type LeadTime = {
  inicio: string | null;
  fim: string | null;
  horasAteAgora: number | null;
  diasAteAgora: number | null;
  horasFinal: number | null;
  diasFinal: number | null;
};

type ScanEventRow = {
  id: string;
  etiqueta: string;
  status: string;
  note: string | null;
  createdAt: string;
};

type RepColeta = {
  id: string;
  nf: string;
  pesoKg: number;
  valorFrete: number;
  pctPeso: number | null;
  pctFrete: number | null;
};

type Representatividade = {
  planejamentoId: string;
  planejamentoName: string;
  totalColetas: number;
  totalPesoKg: number;
  totalValorFrete: number;
  estaNF: {
    pesoKg: number;
    valorFrete: number;
    pctPeso: number | null;
    pctFrete: number | null;
  };
  veiculo: {
    placa: string;
    capacidadeKg: number | null;
    capacidadeM3: number | null;
    pctCapacidadePeso: number | null;
  } | null;
  coletas: RepColeta[];
};

function fmt(iso?: string | null) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  } catch {
    return String(iso);
  }
}

export default function ColetaDetalhePage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '').trim();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [coleta, setColeta] = useState<Coleta | null>(null);
  const [lead, setLead] = useState<LeadTime | null>(null);

  // ✅ auditoria/eventos
  const [eventos, setEventos] = useState<ScanEventRow[]>([]);
  const [eventosErr, setEventosErr] = useState<string | null>(null);

  // representatividade
  const [repData, setRepData] = useState<Representatividade[]>([]);

  // form
  const [nf, setNf] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [valorFrete, setValorFrete] = useState('');
  const [pesoTotalKg, setPesoTotalKg] = useState('');

  const card: React.CSSProperties = {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  };
  const labelStyle: React.CSSProperties = { marginBottom: 4, color: '#475569', fontSize: 12, fontWeight: 600 };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: 8,
    background: '#f8fafc',
    color: '#1e293b',
    border: '1px solid #cbd5e1',
    borderRadius: 6,
  };
  const btn: React.CSSProperties = { padding: '8px 12px', borderRadius: 6, border: 0, cursor: 'pointer', fontWeight: 600 };

  async function loadEventos() {
    if (!id) return;
    try {
      setEventosErr(null);
      const res = await fetch(`/api/coletas/${encodeURIComponent(id)}/eventos?limit=50`, { cache: 'no-store' });
      const j = await res.json().catch(() => null);

      if (!res.ok || !j || j.ok === false) {
        throw new Error(j?.error || 'Falha ao carregar eventos');
      }

      const arr: ScanEventRow[] = Array.isArray(j?.eventos) ? j.eventos : [];
      setEventos(arr);
    } catch (e: any) {
      setEventosErr(e?.message || 'Falha ao carregar eventos');
      setEventos([]);
    }
  }

  async function load() {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/coletas/${encodeURIComponent(id)}`, { cache: 'no-store' });
      const j = await res.json().catch(() => null);

      if (!res.ok || !j || j.ok === false) {
        throw new Error(j?.error || 'Falha ao carregar coleta');
      }

      const c = (j.coleta || null) as Coleta | null;
      const lt = (j.leadTimePatio || null) as LeadTime | null;

      setColeta(c);
      setLead(lt);
      setRepData(Array.isArray(j.representatividade) ? j.representatividade : []);

      if (c) {
        setNf(c.nf ?? '');
        setClienteId(c.clienteId ?? '');
        setCidade(c.cidade ?? '');
        setUf((c.uf ?? '').toUpperCase());
        setValorFrete(String(c.valorFrete ?? ''));
        setPesoTotalKg(String(c.pesoTotalKg ?? ''));
      }

      // ✅ carrega auditoria junto (não bloqueia se der erro)
      void loadEventos();
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar coleta');
      setColeta(null);
      setLead(null);
      setEventos([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const leadLabel = useMemo(() => {
    if (!lead) return '—';
    const dias = lead.diasFinal ?? lead.diasAteAgora;
    const horas = lead.horasFinal ?? lead.horasAteAgora;
    if (dias == null || horas == null) return '—';
    return `${dias} dias (${horas} h)`;
  }, [lead]);

  async function salvar() {
    if (!id) return;
    try {
      setSaving(true);
      setError(null);

      const vf = Number(String(valorFrete).replace(',', '.'));
      const pk = Number(String(pesoTotalKg).replace(',', '.'));

      if (!Number.isFinite(vf)) throw new Error('Valor do frete inválido');
      if (!Number.isFinite(pk)) throw new Error('Peso total (kg) inválido');
      if (!/^[A-Z]{2}$/.test(String(uf || '').toUpperCase())) throw new Error('UF inválida (2 letras)');

      const body = {
        nf,
        cidade,
        uf: uf.toUpperCase(),
        valorFrete: vf,
        pesoTotalKg: pk,
        clienteId: clienteId.trim(),
      };

      const res = await fetch(`/api/coletas/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.ok === false) throw new Error(j?.error || 'Falha ao salvar');

      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function marcarSaidaPatio() {
    if (!id) return;
    if (!confirm('Marcar saída do pátio agora? (embarqueAt + fimPatioAt + status=CARREGADA)')) return;

    try {
      setSaving(true);
      setError(null);

      const res = await fetch(`/api/coletas/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'MARCAR_SAIDA_PATIO' }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.ok === false) throw new Error(j?.error || 'Falha ao marcar saída do pátio');

      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao marcar saída do pátio');
    } finally {
      setSaving(false);
    }
  }

  async function excluir() {
    if (!id) return;
    if (!confirm('Excluir esta coleta?')) return;

    try {
      setSaving(true);
      setError(null);

      const res = await fetch(`/api/coletas/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.ok === false) throw new Error(j?.error || 'Falha ao excluir');

      router.push('/coletas');
    } catch (e: any) {
      setError(e?.message || 'Falha ao excluir');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '20px auto', padding: 16, color: '#1e293b' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 8, color: '#1A4A1A' }}>Detalhes da Coleta</h1>
        <Link href="/coletas" style={{ color: '#1A4A1A', textDecoration: 'underline', fontWeight: 600 }}>
          ← Voltar
        </Link>
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: 10 }}>{error}</div>}
      {loading && <div>Carregando…</div>}

      {coleta && (
        <>
          {/* Painel de Lead Time do Pátio */}
          <div style={{ ...card, marginBottom: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, color: '#475569' }}>Status</div>
                <div style={{ fontWeight: 900, color: '#1e293b' }}>{coleta.status}</div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: '#475569' }}>Entrada no pátio</div>
                <div style={{ fontWeight: 900, color: '#1e293b' }}>{fmt(coleta.entradaPatioAt)}</div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: '#475569' }}>Saída do pátio</div>
                <div style={{ fontWeight: 900, color: '#1e293b' }}>{fmt(coleta.fimPatioAt ?? coleta.embarqueAt)}</div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: '#475569' }}>Lead Time Pátio</div>
                <div style={{ fontWeight: 900, color: '#1e293b' }}>{leadLabel}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {lead?.fim ? 'Final (entrada → saída)' : 'Parcial (entrada → agora)'}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={marcarSaidaPatio}
                disabled={saving}
                style={{ ...btn, background: '#22c55e', color: '#1e293b', opacity: saving ? 0.7 : 1 }}
              >
                Marcar saída do pátio (agora)
              </button>

              <button
                onClick={() => void loadEventos()}
                disabled={saving}
                style={{ ...btn, background: '#1A4A1A', color: 'white', opacity: saving ? 0.7 : 1 }}
                title="Recarregar eventos de auditoria"
              >
                Recarregar auditoria
              </button>
            </div>
          </div>

          {/* Dados gerais */}
          <div style={card}>
            <div style={{ marginBottom: 12, opacity: 0.85, fontSize: 13, color: '#64748b' }}>
              ID: <code>{coleta.id}</code>
            </div>

            <div style={{ marginBottom: 10, color: '#475569' }}>
              Cliente: <strong>{coleta.Cliente?.razao || coleta.clienteId}</strong>
            </div>

            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <label style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={labelStyle}>NF</span>
                <input value={nf} onChange={(e) => setNf(e.target.value)} style={inputStyle} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={labelStyle}>Cliente (ID)</span>
                <input
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  style={inputStyle}
                  placeholder="id do cliente"
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={labelStyle}>Cidade</span>
                <input value={cidade} onChange={(e) => setCidade(e.target.value)} style={inputStyle} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={labelStyle}>UF</span>
                <input
                  value={uf}
                  onChange={(e) => setUf(e.target.value.toUpperCase())}
                  style={inputStyle}
                  maxLength={2}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={labelStyle}>Valor do Frete (R$)</span>
                <input
                  value={valorFrete}
                  onChange={(e) => setValorFrete(e.target.value)}
                  style={inputStyle}
                  placeholder="ex.: 4587,00"
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={labelStyle}>Peso Total (kg)</span>
                <input
                  value={pesoTotalKg}
                  onChange={(e) => setPesoTotalKg(e.target.value)}
                  style={inputStyle}
                  placeholder="ex.: 1200"
                />
              </label>
            </div>

            <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={salvar}
                disabled={saving}
                style={{ ...btn, background: '#f59e0b', color: 'black', opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>

              <button onClick={excluir} disabled={saving} style={{ ...btn, background: '#ef4444', color: 'white' }}>
                Excluir
              </button>

              <Link href="/clientes" style={{ ...btn, background: '#1A4A1A', color: 'white', textDecoration: 'none' }}>
                Ver clientes
              </Link>
            </div>

            {/* Itens */}
            <div style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#1e293b' }}>Itens da Coleta</h3>

              {!coleta.itens || coleta.itens.length === 0 ? (
                <div style={{ color: '#475569' }}>(Sem itens cadastrados)</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: '#475569' }}>
                      <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Produto</th>
                      <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Qtd</th>
                      <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Etiqueta</th>
                      <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Volumes</th>
                      <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Peso (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coleta.itens.map((it) => {
                      const prod = it.Produto;
                      const peso = prod?.pesoKg != null ? prod.pesoKg * (it.quantidade ?? 1) : null;
                      const volumesCount = it.volumes?.length ?? 0;

                      return (
                        <tr key={it.id} style={{ color: '#1e293b' }}>
                          <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>
                            <div style={{ fontWeight: 900 }}>{prod?.descricao || prod?.code || it.id}</div>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>{prod?.code || '—'}</div>
                          </td>
                          <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{it.quantidade ?? '-'}</td>
                          <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>
                            {it.etiqueta ? <code>{it.etiqueta}</code> : '—'}
                          </td>
                          <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{volumesCount}</td>
                          <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>
                            {peso != null ? Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(peso) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Paradas vinculadas */}
            <div style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#1e293b' }}>Paradas vinculadas</h3>

              {!coleta.paradas || coleta.paradas.length === 0 ? (
                <div style={{ color: '#475569' }}>(Sem paradas vinculadas)</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: '#475569' }}>
                      <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Ordem</th>
                      <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Parada</th>
                      <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Status</th>
                      <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Check-in</th>
                      <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Check-out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coleta.paradas.map((p) => (
                      <tr key={p.id} style={{ color: '#1e293b' }}>
                        <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0', fontWeight: 900 }}>{p.ordem}</td>
                        <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>
                          <div style={{ fontWeight: 900 }}>{p.label}</div>
                          <div style={{ fontSize: 11, opacity: 0.75 }}>
                            Rota: {p.rotaId ? <code>{p.rotaId}</code> : '—'}
                          </div>
                        </td>
                        <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{p.statusExec}</td>
                        <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{fmt(p.checkinAt)}</td>
                        <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{fmt(p.checkoutAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Representatividade na Carga */}
            {repData.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#1e293b' }}>
                  Representatividade na Carga
                </h3>
                {repData.map((rep) => {
                  const fmtBRL = Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
                  const fmtNum = Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
                  return (
                    <div key={rep.planejamentoId} style={{ marginBottom: 16, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div>
                          <span style={{ fontWeight: 700, color: '#1e293b' }}>{rep.planejamentoName}</span>
                          <span style={{ fontSize: 12, color: '#475569', marginLeft: 8 }}>({rep.totalColetas} NFs na carga)</span>
                        </div>
                        <Link href={`/planejamento/${rep.planejamentoId}/carga`} style={{ color: '#1A4A1A', fontSize: 12, textDecoration: 'underline' }}>
                          Ver carga
                        </Link>
                      </div>

                      {/* Barras de % */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>
                            Peso: {fmtNum.format(rep.estaNF.pesoKg)} / {fmtNum.format(rep.totalPesoKg)} kg
                          </div>
                          <div style={{ height: 18, borderRadius: 4, background: '#e2e8f0', overflow: 'hidden', position: 'relative' }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(rep.estaNF.pctPeso ?? 0, 100)}%`,
                              background: '#22c55e',
                              borderRadius: 4,
                              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4,
                            }}>
                              {(rep.estaNF.pctPeso ?? 0) >= 10 && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{fmtNum.format(rep.estaNF.pctPeso!)}%</span>
                              )}
                            </div>
                            {(rep.estaNF.pctPeso ?? 0) < 10 && rep.estaNF.pctPeso != null && (
                              <span style={{ position: 'absolute', top: 1, left: 4, fontSize: 10, fontWeight: 700, color: '#475569' }}>{fmtNum.format(rep.estaNF.pctPeso)}%</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>
                            Frete: {fmtBRL.format(rep.estaNF.valorFrete)} / {fmtBRL.format(rep.totalValorFrete)}
                          </div>
                          <div style={{ height: 18, borderRadius: 4, background: '#e2e8f0', overflow: 'hidden', position: 'relative' }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(rep.estaNF.pctFrete ?? 0, 100)}%`,
                              background: '#3b82f6',
                              borderRadius: 4,
                              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4,
                            }}>
                              {(rep.estaNF.pctFrete ?? 0) >= 10 && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{fmtNum.format(rep.estaNF.pctFrete!)}%</span>
                              )}
                            </div>
                            {(rep.estaNF.pctFrete ?? 0) < 10 && rep.estaNF.pctFrete != null && (
                              <span style={{ position: 'absolute', top: 1, left: 4, fontSize: 10, fontWeight: 700, color: '#475569' }}>{fmtNum.format(rep.estaNF.pctFrete)}%</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Veículo info */}
                      {rep.veiculo && (
                        <div style={{ fontSize: 12, color: '#475569', marginBottom: 10 }}>
                          Veículo: <strong style={{ color: '#1e293b' }}>{rep.veiculo.placa}</strong>
                          {rep.veiculo.capacidadeKg != null && (
                            <span> — Cap.: {Intl.NumberFormat('pt-BR').format(rep.veiculo.capacidadeKg)} kg</span>
                          )}
                          {rep.veiculo.pctCapacidadePeso != null && (
                            <span style={{ color: rep.veiculo.pctCapacidadePeso > 100 ? '#ef4444' : rep.veiculo.pctCapacidadePeso > 80 ? '#f59e0b' : '#22c55e', fontWeight: 700, marginLeft: 6 }}>
                              ({fmtNum.format(rep.veiculo.pctCapacidadePeso)}% ocupado)
                            </span>
                          )}
                        </div>
                      )}

                      {/* Tabela de todas NFs na carga */}
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ color: '#475569' }}>
                            <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #e2e8f0' }}>NF</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #e2e8f0' }}>Peso (kg)</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #e2e8f0' }}>% Peso</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #e2e8f0' }}>Frete</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #e2e8f0' }}>% Frete</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rep.coletas.map((rc) => (
                            <tr key={rc.id} style={{ color: rc.id === id ? '#F5BE16' : '#e5e7eb', fontWeight: rc.id === id ? 700 : 400 }}>
                              <td style={{ padding: '4px 8px', borderBottom: '1px solid #1e2a36' }}>
                                {rc.id === id ? `▸ ${rc.nf}` : (
                                  <Link href={`/coletas/${rc.id}`} style={{ color: '#1A4A1A', textDecoration: 'none' }}>{rc.nf}</Link>
                                )}
                              </td>
                              <td style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #1e2a36' }}>
                                {fmtNum.format(rc.pesoKg)}
                              </td>
                              <td style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #1e2a36' }}>
                                {rc.pctPeso != null ? `${fmtNum.format(rc.pctPeso)}%` : '—'}
                              </td>
                              <td style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #1e2a36' }}>
                                {fmtBRL.format(rc.valorFrete)}
                              </td>
                              <td style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #1e2a36' }}>
                                {rc.pctFrete != null ? `${fmtNum.format(rc.pctFrete)}%` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ✅ Auditoria / Eventos */}
            <div style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#1e293b' }}>
                Auditoria (Eventos)
              </h3>

              {eventosErr && <div style={{ color: '#dc2626', marginBottom: 8 }}>{eventosErr}</div>}

              {eventos.length === 0 ? (
                <div style={{ color: '#475569' }}>(Sem eventos registrados para esta coleta)</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: '#475569' }}>
                      <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Data</th>
                      <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Status</th>
                      <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Note</th>
                      <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Etiqueta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventos.map((ev) => (
                      <tr key={ev.id} style={{ color: '#1e293b' }}>
                        <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                          {fmt(ev.createdAt)}
                        </td>
                        <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>
                          <code>{ev.status}</code>
                        </td>
                        <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>
                          {ev.note ? ev.note : <span style={{ color: '#94a3b8' }}>—</span>}
                        </td>
                        <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>
                          <code>{ev.etiqueta}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
