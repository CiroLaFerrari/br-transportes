// src/app/coletas/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

type Coleta = {
  id: string;
  nf: string;
  cidade: string;
  uf: string;
  valorFrete: number | null;
  pesoTotalKg: number | null;
  clienteId: string;
  prazoEntrega?: string | null;
  urgencia?: string | null;
  minutaId?: string | null;
  coletador?: string | null;
  pedido?: string | null;
  createdAt?: string;
  Cliente?: { id: string; razao: string | null };
};

type Cliente = { id: string; razao: string };

type Produto = {
  id: string;
  code: string;
  descricao: string;
  pesoKg: number | null;
  precoUnitario: number | null;
  volumeM3: number | null;
};

type MetricasResp =
  | {
      ok?: boolean;
      error?: string;
      data?: Array<{
        coletaId: string;
        volumeTotalM3?: number | null;
        volumeM3?: number | null;
        totalM3?: number | null;
        m3Total?: number | null;
        volumesM3?: number | null;
      }>;
    }
  | Array<any>;

function pickM3(row: any): number {
  const candidates = [
    row?.volumeTotalM3,
    row?.volumeM3,
    row?.totalM3,
    row?.m3Total,
    row?.volumesM3,
    row?.m3,
    row?.volume,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export default function ColetasPage() {
  const [list, setList] = useState<Coleta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [itensColeta, setItensColeta] = useState<Array<{ produtoId: string; quantidade: number }>>([]);
  const [prodBusca, setProdBusca] = useState('');
  const [prodDropOpen, setProdDropOpen] = useState(false);
  const [prodSelecionado, setProdSelecionado] = useState<Produto | null>(null);
  const prodDropRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // ✅ métricas (volume por coleta)
  const [metricasMap, setMetricasMap] = useState<Record<string, { volumeM3: number }>>({});
  const [metricasErr, setMetricasErr] = useState<string | null>(null);

  // filtros & paginação
  const [fNf, setFNf] = useState('');
  const [fCidade, setFCidade] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);

  // form criação
  const [form, setForm] = useState({
    nf: '',
    cidade: '',
    uf: '',
    valorFrete: '',
    pesoTotalKg: '',
    clienteId: '',
    coletador: '',
    pedido: '',
  });

  // calcula se tem próxima página com base no total
  const hasMore = page * limit < total;

  async function loadMetricas(ids: string[]) {
    try {
      setMetricasErr(null);
      if (!ids.length) {
        setMetricasMap({});
        return;
      }

      const res = await fetch('/api/coletas/metricas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });

      const j = (await res.json().catch(() => null)) as MetricasResp | null;
      if (!res.ok || !j) throw new Error((j as any)?.error || 'Falha ao carregar métricas');

      const arr = Array.isArray(j) ? j : Array.isArray((j as any)?.data) ? (j as any).data : [];

      const map: Record<string, { volumeM3: number }> = {};
      for (const row of arr) {
        const coletaId = String(row?.coletaId || row?.id || '').trim();
        if (!coletaId) continue;
        map[coletaId] = { volumeM3: pickM3(row) };
      }
      setMetricasMap(map);
    } catch (e: any) {
      setMetricasErr(e?.message || 'Falha ao carregar métricas');
      setMetricasMap({});
    }
  }

  async function loadColetas(gotoPage = page) {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set('limit', String(limit));
      qs.set('page', String(gotoPage));
      qs.set('withMeta', '1');

      if (fNf.trim()) qs.set('nf', fNf.trim());
      if (fCidade.trim()) qs.set('cidade', fCidade.trim());

      const res = await fetch('/api/coletas?' + qs.toString(), { cache: 'no-store' });
      const raw = await res.json().catch(() => null);

      if (!res.ok) {
        setMsg(raw?.error || 'Falha ao carregar coletas');
        setList([]);
        setTotal(0);
        setMetricasMap({});
        return;
      }

      const data: Coleta[] = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];

      const totalFromHeader = Number(res.headers.get('X-Total-Count') || '0');
      const totalCalc = Number(raw?.total || 0) || totalFromHeader || data.length;

      setList(data);
      setPage(Number(raw?.page || gotoPage));
      setLimit(Number(raw?.limit || limit));
      setTotal(totalCalc);
      setMsg(null);

      // ✅ carrega volumes das coletas listadas
      const ids = data.map((c) => c.id).filter(Boolean);
      void loadMetricas(ids);
    } catch {
      setMsg('Falha ao carregar coletas');
      setList([]);
      setTotal(0);
      setMetricasMap({});
    } finally {
      setLoading(false);
    }
  }

  async function loadClientes() {
    try {
      const res = await fetch('/api/clientes?limit=200', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) return;
      const arr: Cliente[] = Array.isArray(json) ? json : [];
      setClientes(arr);
    } catch {
      // silencioso
    }
  }

  async function loadProdutos() {
    try {
      const res = await fetch('/api/produtos?take=200', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.items) setProdutos(json.items);
    } catch {}
  }

  useEffect(() => {
    void loadColetas(1);
    void loadClientes();
    void loadProdutos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close product dropdown on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (prodDropRef.current && !prodDropRef.current.contains(e.target as Node)) {
        setProdDropOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const totaisItens = useMemo(() => {
    let peso = 0, valor = 0, volume = 0;
    for (const item of itensColeta) {
      const prod = produtos.find(p => p.id === item.produtoId);
      if (!prod) continue;
      peso += (prod.pesoKg ?? 0) * item.quantidade;
      valor += (prod.precoUnitario ?? 0) * item.quantidade;
      volume += (prod.volumeM3 ?? 0) * item.quantidade;
    }
    return { peso, valor, volume };
  }, [itensColeta, produtos]);

  useEffect(() => {
    if (itensColeta.length > 0) {
      setForm(prev => ({
        ...prev,
        pesoTotalKg: totaisItens.peso > 0 ? String(totaisItens.peso) : prev.pesoTotalKg,
        valorFrete: totaisItens.valor > 0 ? String(totaisItens.valor) : prev.valorFrete,
      }));
    }
  }, [totaisItens]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    const vf = Number(form.valorFrete.replace(',', '.'));
    const pk = Number(form.pesoTotalKg.replace(',', '.'));

    if (!Number.isFinite(vf)) return setMsg('Valor do frete inválido');
    if (!Number.isFinite(pk)) return setMsg('Peso total (kg) inválido');
    if (!form.clienteId.trim()) return setMsg('Selecione ou informe o Cliente');

    try {
      const res = await fetch('/api/coletas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nf: form.nf,
          cidade: form.cidade,
          uf: form.uf,
          valorFrete: vf,
          pesoTotalKg: pk,
          clienteId: form.clienteId.trim(),
          coletador: form.coletador.trim() || undefined,
          pedido: form.pedido.trim() || undefined,
          itens: itensColeta.length > 0 ? itensColeta : undefined,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg(json?.error || 'Falha ao criar');
        return;
      }

      setForm({ nf: '', cidade: '', uf: '', valorFrete: '', pesoTotalKg: '', clienteId: '', coletador: '', pedido: '' });
      setItensColeta([]);
      await loadColetas(1);
      setMsg('Coleta criada com sucesso.');
    } catch {
      setMsg('Falha ao criar');
    }
  };

  const excluir = async (id: string) => {
    if (!confirm('Excluir esta coleta?')) return;
    try {
      const res = await fetch(`/api/coletas?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        alert(json?.error || 'Erro ao excluir');
        return;
      }
      await loadColetas(page);
    } catch {
      alert('Erro ao excluir');
    }
  };

  const exportarExcel = async () => {
    try {
      const res = await fetch('/api/coletas/export', { method: 'GET' });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || 'Falha ao exportar');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'coletas.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || 'Falha ao exportar');
    }
  };

  const exportarPDF = async () => {
    try {
      const res = await fetch('/api/coletas/manifesto', { method: 'GET' });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || 'Falha ao gerar PDF');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'manifesto_coletas.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || 'Falha ao gerar PDF');
    }
  };

  const recarregar = async () => {
    setPage(1);
    await loadColetas(1);
  };

  const resumoVol = useMemo(() => {
    let totalM3 = 0;
    for (const c of list) {
      const m3 = metricasMap[c.id]?.volumeM3 ?? 0;
      totalM3 += Number.isFinite(m3) ? m3 : 0;
    }
    return { totalM3 };
  }, [list, metricasMap]);

  return (
    <div style={{ maxWidth: 1200, margin: '20px auto', padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 12, color: '#1A4A1A' }}>Coletas</h1>

      {/* FORM FILTROS */}
      <div
        style={{
          display: 'grid',
          gap: 8,
          gridTemplateColumns: '160px 220px 100px 1fr',
          alignItems: 'end',
          marginBottom: 12,
          background: '#ffffff',
          padding: 12,
          borderRadius: 8,
          border: '1px solid #e2e8f0',
        }}
      >
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#64748b' }}>Filtrar por NF</label>
          <input
            value={fNf}
            onChange={(e) => setFNf(e.target.value)}
            placeholder="Ex.: 000123"
            style={{
              width: '100%',
              padding: 8,
              background: '#ffffff',
              color: '#1e293b',
              border: '1px solid #d1d5db',
              borderRadius: 6,
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#64748b' }}>Filtrar por cidade</label>
          <input
            value={fCidade}
            onChange={(e) => setFCidade(e.target.value)}
            placeholder="Ex.: São Paulo"
            style={{
              width: '100%',
              padding: 8,
              background: '#ffffff',
              color: '#1e293b',
              border: '1px solid #d1d5db',
              borderRadius: 6,
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#64748b' }}>Por página</label>
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
              void loadColetas(1);
            }}
            style={{
              width: '100%',
              padding: 8,
              background: '#ffffff',
              color: '#1e293b',
              border: '1px solid #d1d5db',
              borderRadius: 6,
            } as any}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={recarregar}
            style={{ padding: '8px 12px', background: '#1A4A1A', color: 'white', border: 0, borderRadius: 6 }}
            disabled={loading}
          >
            {loading ? 'Carregando…' : 'Recarregar'}
          </button>
        </div>
      </div>

      {/* PRODUTOS DA COLETA */}
      <div style={{
        marginBottom: 12,
        background: '#ffffff',
        padding: 12,
        borderRadius: 8,
        border: '1px solid #e2e8f0',
      }}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#1A4A1A', marginBottom: 8 }}>
          Produtos da Coleta
        </label>

        {/* Add product row */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', marginBottom: 8 }}>
          <div style={{ flex: 1, position: 'relative' }} ref={prodDropRef}>
            <label style={{ display: 'block', fontSize: 12, color: '#64748b' }}>Produto</label>
            <input
              type="text"
              value={prodSelecionado ? `${prodSelecionado.code} — ${prodSelecionado.descricao}` : prodBusca}
              onChange={(e) => {
                setProdBusca(e.target.value);
                setProdSelecionado(null);
                setProdDropOpen(true);
              }}
              onFocus={() => setProdDropOpen(true)}
              placeholder="Digite para buscar produto..."
              style={{
                width: '100%',
                padding: 8,
                background: prodSelecionado ? '#f0fdf4' : '#ffffff',
                color: '#1e293b',
                border: `1px solid ${prodSelecionado ? '#22c55e' : '#d1d5db'}`,
                borderRadius: 6,
              }}
            />
            {prodSelecionado && (
              <button
                type="button"
                onClick={() => { setProdSelecionado(null); setProdBusca(''); }}
                style={{ position: 'absolute', right: 8, top: 28, background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94a3b8' }}
                title="Limpar"
              >
                x
              </button>
            )}
            {prodDropOpen && !prodSelecionado && (() => {
              const termo = prodBusca.toLowerCase().trim();
              const filtered = termo
                ? produtos.filter(p =>
                    p.code.toLowerCase().includes(termo) ||
                    p.descricao.toLowerCase().includes(termo)
                  ).slice(0, 50)
                : produtos.slice(0, 50);
              return filtered.length > 0 ? (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: '#fff', border: '1px solid #d1d5db', borderRadius: 6,
                  maxHeight: 280, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}>
                  {filtered.map(p => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setProdSelecionado(p);
                        setProdBusca('');
                        setProdDropOpen(false);
                      }}
                      style={{
                        padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                        borderBottom: '1px solid #f1f5f9',
                      }}
                      onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#f0fdf4'; }}
                      onMouseLeave={(e) => { (e.target as HTMLElement).style.background = '#fff'; }}
                    >
                      <span style={{ fontWeight: 600, color: '#1A4A1A' }}>{p.code}</span>
                      <span style={{ color: '#64748b' }}> — {p.descricao}</span>
                      {p.pesoKg ? <span style={{ color: '#f59e0b', marginLeft: 6, fontSize: 11 }}>({p.pesoKg}kg)</span> : null}
                    </div>
                  ))}
                </div>
              ) : termo ? (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: '#fff', border: '1px solid #d1d5db', borderRadius: 6,
                  padding: '12px', color: '#94a3b8', fontSize: 13,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}>
                  Nenhum produto encontrado
                </div>
              ) : null;
            })()}
          </div>
          <div style={{ width: 100 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#64748b' }}>Qtd</label>
            <input
              id="addProdutoQtd"
              type="number"
              min={1}
              defaultValue={1}
              style={{ width: '100%', padding: 8, background: '#ffffff', color: '#1e293b', border: '1px solid #d1d5db', borderRadius: 6 }}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              if (!prodSelecionado) return;
              const qtd = Number((document.getElementById('addProdutoQtd') as HTMLInputElement)?.value) || 1;
              setItensColeta(prev => {
                const existing = prev.find(i => i.produtoId === prodSelecionado.id);
                if (existing) return prev.map(i => i.produtoId === prodSelecionado.id ? { ...i, quantidade: i.quantidade + qtd } : i);
                return [...prev, { produtoId: prodSelecionado.id, quantidade: qtd }];
              });
              setProdSelecionado(null);
              setProdBusca('');
            }}
            style={{
              padding: '8px 12px',
              background: prodSelecionado ? '#1A4A1A' : '#94a3b8',
              color: prodSelecionado ? '#F5BE16' : '#fff',
              border: 0, borderRadius: 6, whiteSpace: 'nowrap', fontWeight: 700,
              cursor: prodSelecionado ? 'pointer' : 'not-allowed',
            }}
          >
            + Adicionar
          </button>
        </div>

        {/* Selected products list */}
        {itensColeta.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 8 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #e2e8f0' }}>Produto</th>
                <th style={{ textAlign: 'center', padding: '4px 8px', borderBottom: '1px solid #e2e8f0' }}>Qtd</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #e2e8f0' }}>Peso (kg)</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #e2e8f0' }}>Valor (R$)</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #e2e8f0' }}>Volume (m3)</th>
                <th style={{ padding: '4px 8px', borderBottom: '1px solid #e2e8f0' }}></th>
              </tr>
            </thead>
            <tbody>
              {itensColeta.map(item => {
                const prod = produtos.find(p => p.id === item.produtoId);
                return (
                  <tr key={item.produtoId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '4px 8px' }}>{prod ? `${prod.code} — ${prod.descricao}` : item.produtoId}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                      <input
                        type="number"
                        min={1}
                        value={item.quantidade}
                        onChange={(e) => {
                          const q = Math.max(1, Number(e.target.value) || 1);
                          setItensColeta(prev => prev.map(i => i.produtoId === item.produtoId ? { ...i, quantidade: q } : i));
                        }}
                        style={{ width: 60, padding: '2px 4px', textAlign: 'center', border: '1px solid #d1d5db', borderRadius: 4 }}
                      />
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{((prod?.pesoKg ?? 0) * item.quantidade).toFixed(2)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{((prod?.precoUnitario ?? 0) * item.quantidade).toFixed(2)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{((prod?.volumeM3 ?? 0) * item.quantidade).toFixed(4)}</td>
                    <td style={{ padding: '4px 8px' }}>
                      <button
                        type="button"
                        onClick={() => setItensColeta(prev => prev.filter(i => i.produtoId !== item.produtoId))}
                        style={{ padding: '2px 6px', background: '#ef4444', color: 'white', border: 0, borderRadius: 4, fontSize: 11 }}
                      >
                        X
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: '2px solid #e2e8f0' }}>
                <td style={{ padding: '4px 8px' }}>Total</td>
                <td></td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{totaisItens.peso.toFixed(2)} kg</td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>R$ {totaisItens.valor.toFixed(2)}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{totaisItens.volume.toFixed(4)} m3</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* FORM CRIACAO */}
      <form
        onSubmit={onSubmit}
        style={{
          display: 'grid',
          gap: 8,
          gridTemplateColumns: '140px 1fr 90px 150px 150px 1fr 160px 120px',
          alignItems: 'end',
          marginBottom: 16,
          background: '#ffffff',
          padding: 12,
          borderRadius: 8,
          border: '1px solid #e2e8f0',
        }}
      >
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#64748b' }}>NF</label>
          <input
            name="nf"
            value={form.nf}
            onChange={onChange}
            placeholder="Ex.: 000123"
            style={{
              width: '100%',
              padding: 8,
              background: '#ffffff',
              color: '#1e293b',
              border: '1px solid #d1d5db',
              borderRadius: 6,
            }}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#64748b' }}>Cidade</label>
          <input
            name="cidade"
            value={form.cidade}
            onChange={onChange}
            placeholder="Ex.: São Paulo"
            style={{
              width: '100%',
              padding: 8,
              background: '#ffffff',
              color: '#1e293b',
              border: '1px solid #d1d5db',
              borderRadius: 6,
            }}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#64748b' }}>UF</label>
          <input
            name="uf"
            value={form.uf}
            onChange={onChange}
            placeholder="SP"
            maxLength={2}
            style={{
              width: '100%',
              padding: 8,
              background: '#ffffff',
              color: '#1e293b',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              textTransform: 'uppercase',
            }}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#64748b' }}>Valor do frete</label>
          <input
            name="valorFrete"
            value={form.valorFrete}
            onChange={onChange}
            placeholder="Ex.: 456.00"
            inputMode="decimal"
            style={{
              width: '100%',
              padding: 8,
              background: '#ffffff',
              color: '#1e293b',
              border: '1px solid #d1d5db',
              borderRadius: 6,
            }}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#64748b' }}>Peso total (kg)</label>
          <input
            name="pesoTotalKg"
            value={form.pesoTotalKg}
            onChange={onChange}
            placeholder="Ex.: 1200"
            inputMode="decimal"
            style={{
              width: '100%',
              padding: 8,
              background: '#ffffff',
              color: '#1e293b',
              border: '1px solid #d1d5db',
              borderRadius: 6,
            }}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#64748b' }}>Cliente</label>
          <select
            name="clienteId"
            value={form.clienteId}
            onChange={onChange}
            style={{
              width: '100%',
              padding: 8,
              background: '#ffffff',
              color: '#1e293b',
              border: '1px solid #d1d5db',
              borderRadius: 6,
            }}
            required
          >
            <option value="">Selecione...</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.razao} — {c.id}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#64748b' }}>Coletador</label>
          <input
            name="coletador"
            value={form.coletador}
            onChange={onChange}
            placeholder="Motorista coleta"
            style={{
              width: '100%',
              padding: 8,
              background: '#ffffff',
              color: '#1e293b',
              border: '1px solid #d1d5db',
              borderRadius: 6,
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#64748b' }}>Pedido</label>
          <input
            name="pedido"
            value={form.pedido}
            onChange={onChange}
            placeholder="Nº pedido"
            style={{
              width: '100%',
              padding: 8,
              background: '#ffffff',
              color: '#1e293b',
              border: '1px solid #d1d5db',
              borderRadius: 6,
            }}
          />
        </div>

        <div style={{ gridColumn: '1 / span 8', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="submit" style={{ padding: '8px 12px', background: '#2563eb', color: 'white', border: 0, borderRadius: 6 }}>
            Criar coleta
          </button>

          <Link
            href="/clientes"
            style={{ padding: '8px 12px', background: '#1A4A1A', color: 'white', borderRadius: 6, textDecoration: 'none' }}
            title="Ver lista de clientes"
          >
            Ver clientes (IDs)
          </Link>

          <button
            type="button"
            onClick={exportarExcel}
            style={{ padding: '8px 12px', background: '#0891b2', color: 'white', border: 0, borderRadius: 6 }}
            title="Baixar planilha .xlsx com as coletas"
          >
            Exportar Excel
          </button>

          <button
            type="button"
            onClick={exportarPDF}
            style={{ padding: '8px 12px', background: '#16a34a', color: 'white', border: 0, borderRadius: 6 }}
            title="Baixar Manifesto em PDF"
          >
            Exportar PDF (Manifesto)
          </button>

          <span style={{ alignSelf: 'center', color: msg?.includes('sucesso') ? '#9bdc9b' : '#f59e0b' }}>{msg}</span>
        </div>
      </form>

      {/* LISTA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0 8px' }}>
        <div style={{ color: '#64748b', fontSize: 13 }}>
          Página {page} • {total} registro(s)
          <span style={{ marginLeft: 10 }}>
            • Volume (página): <b>{Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(resumoVol.totalM3)}</b> m³
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              const p = Math.max(1, page - 1);
              setPage(p);
              void loadColetas(p);
            }}
            disabled={page <= 1 || loading}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#1e293b',
            }}
          >
            ← Anterior
          </button>
          <button
            onClick={() => {
              const p = page + 1;
              setPage(p);
              void loadColetas(p);
            }}
            disabled={!hasMore || loading}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#1e293b',
            }}
          >
            Próxima →
          </button>
        </div>
      </div>

      {metricasErr && <div style={{ color: '#fca5a5', marginBottom: 8 }}>{metricasErr}</div>}

      {loading ? (
        <div>Carregando...</div>
      ) : (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#ffffff', color: '#64748b' }}>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>NF</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Cidade</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>UF</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Valor do frete</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Peso total (kg)</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Volume (m³)</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Cliente</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Coletador</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Pedido</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Urgência</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Prazo</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} style={{ background: '#ffffff', color: '#1e293b' }}>
                  <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{c.nf}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{c.cidade}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{c.uf}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>
                    {Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.valorFrete ?? 0)}
                  </td>
                  <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>
                    {Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(c.pesoTotalKg ?? 0)}
                  </td>
                  <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>
                    {metricasMap[c.id]?.volumeM3 != null ? Number(metricasMap[c.id].volumeM3).toFixed(3) : '—'}
                  </td>
                  <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{c.Cliente?.razao || c.clienteId}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0', fontSize: 12 }}>{c.coletador || '—'}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0', fontSize: 12 }}>{c.pedido || '—'}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>
                    {c.urgencia === 'URGENTE' ? (
                      <span style={{ color: '#ef4444', fontWeight: 700 }}>URGENTE</span>
                    ) : c.urgencia === 'ALTA' ? (
                      <span style={{ color: '#f59e0b', fontWeight: 700 }}>ALTA</span>
                    ) : (
                      <span style={{ color: '#64748b' }}>Normal</span>
                    )}
                  </td>
                  <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>
                    {c.prazoEntrega ? new Date(c.prazoEntrega).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td style={{ padding: '8px 8px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
                    <Link
                      href={`/coletas/${c.id}`}
                      style={{
                        padding: '6px 10px',
                        background: '#0ea5e9',
                        color: '#fff',
                        borderRadius: 6,
                        textDecoration: 'none',
                      }}
                    >
                      Abrir
                    </Link>
                    <button
                      onClick={() => excluir(c.id)}
                      style={{ padding: '6px 10px', background: '#ef4444', color: 'white', border: 0, borderRadius: 6 }}
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}

              {list.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ padding: 16, color: '#64748b', textAlign: 'center' }}>
                    Nenhuma coleta cadastrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}