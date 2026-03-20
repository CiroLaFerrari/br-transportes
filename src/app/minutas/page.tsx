'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Minuta = {
  id: string;
  numero?: string | null;
  nfNumero: string;
  cliente: string;
  cidade: string;
  uf: string;
  motorista?: string | null;
  pedido?: string | null;
  coletador?: string | null;
  dataColeta?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { itens: number };
};

type MinutaVolume = {
  id: string;
  etiqueta: string;
  tipo: string;
  codigo: string;
  descricao: string;
  pesoKg?: number | null;
  alturaCm?: number | null;
  larguraCm?: number | null;
  comprimentoCm?: number | null;
  areaM2?: number | null;
  volumeM3?: number | null;
};

type MinutaItem = {
  id: string;
  produtoCode: string;
  produtoDescricao: string;
  quantidade: number;
  desmontavel: boolean;
  observacao?: string | null;
  volumes: MinutaVolume[];
};

function num(v: any) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
}

export default function MinutasPage() {
  const [loadingList, setLoadingList] = useState(false);
  const [q, setQ] = useState('');
  const [take, setTake] = useState(20);
  const [items, setItems] = useState<Minuta[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  const emptyMinuta: Partial<Minuta> = useMemo(
    () => ({
      numero: '',
      nfNumero: '',
      cliente: '',
      cidade: '',
      uf: 'SP',
      motorista: '',
      pedido: '',
      coletador: '',
      dataColeta: '',
    }),
    [],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Minuta>>(emptyMinuta);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [itens, setItens] = useState<MinutaItem[]>([]);
  const [novoItem, setNovoItem] = useState<{ produtoCode: string; quantidade: any; observacao: string }>({
    produtoCode: '',
    quantidade: 1,
    observacao: '',
  });

  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 10px',
    border: '1px solid #e2e8f0',
    background: '#f8fafc',
    fontWeight: 700,
    color: '#1e293b',
  };
  const td: React.CSSProperties = {
    padding: '8px 10px',
    border: '1px solid #e2e8f0',
    color: '#1e293b',
  };
  const tdNum: React.CSSProperties = { ...td, textAlign: 'right' };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: 8,
    background: '#ffffff',
    color: '#1e293b',
    border: '1px solid #d1d5db',
    borderRadius: 6,
  };
  const btn: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
  };
  const card: React.CSSProperties = {
    marginTop: 16,
    padding: 12,
    border: '1px solid #e2e8f0',
    background: '#ffffff',
    borderRadius: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  };

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadList() {
    try {
      setLoadingList(true);
      setListError(null);

      const url = `/api/minutas?take=${encodeURIComponent(String(take))}${q ? `&search=${encodeURIComponent(q)}` : ''}`;
      const res = await fetch(url);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao listar');

      setItems(j.items || []);
    } catch (e: any) {
      setListError(e?.message || 'Falha ao listar');
    } finally {
      setLoadingList(false);
    }
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyMinuta);
    setItens([]);
    setNovoItem({ produtoCode: '', quantidade: 1, observacao: '' });
    setSaveMsg('');
    setError(null);
  }

  async function saveMinuta() {
    try {
      setSaving(true);
      setError(null);
      setSaveMsg('');

      const body: any = {
        numero: String(form.numero || '').trim() || null,
        nfNumero: String(form.nfNumero || '').trim(),
        cliente: String(form.cliente || '').trim(),
        cidade: String(form.cidade || '').trim(),
        uf: String(form.uf || '').trim().toUpperCase(),
        motorista: String(form.motorista || '').trim() || null,
        pedido: String(form.pedido || '').trim() || null,
        coletador: String(form.coletador || '').trim() || null,
        dataColeta: form.dataColeta ? String(form.dataColeta) : null,
      };

      if (!body.nfNumero) throw new Error('Informe NF');
      if (!body.cliente) throw new Error('Informe Cliente');
      if (!body.cidade) throw new Error('Informe Cidade');
      if (!body.uf || body.uf.length !== 2) throw new Error('UF inválida');

      if (editingId) {
        const res = await fetch(`/api/minutas/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || 'Falha ao atualizar');
        setSaveMsg('Minuta atualizada.');
      } else {
        const res = await fetch('/api/minutas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || 'Falha ao criar');
        setEditingId(j.id);
        setSaveMsg('Minuta criada.');
      }

      await loadList();
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function openMinuta(id: string) {
    try {
      setError(null);
      setSaveMsg('');

      const res = await fetch(`/api/minutas/${id}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao abrir');

      const m = j.minuta as any;

      setEditingId(m.id);
      setForm({
        numero: m.numero ?? '',
        nfNumero: m.nfNumero ?? '',
        cliente: m.cliente ?? '',
        cidade: m.cidade ?? '',
        uf: m.uf ?? 'SP',
        motorista: m.motorista ?? '',
        pedido: m.pedido ?? '',
        coletador: m.coletador ?? '',
        dataColeta: m.dataColeta ? String(m.dataColeta).slice(0, 10) : '',
      });

      setItens(m.itens || []);
      setNovoItem({ produtoCode: '', quantidade: 1, observacao: '' });
    } catch (e: any) {
      setError(e?.message || 'Falha ao abrir minuta');
    }
  }

  async function deleteMinuta(id: string) {
    const ok = confirm('Excluir minuta? Essa ação apaga itens e volumes.');
    if (!ok) return;

    try {
      setError(null);
      const res = await fetch(`/api/minutas/${id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao excluir');

      if (editingId === id) resetForm();
      await loadList();
    } catch (e: any) {
      setError(e?.message || 'Falha ao excluir');
    }
  }

  async function reloadItens() {
    if (!editingId) return;
    const res = await fetch(`/api/minutas/${editingId}`);
    const j = await res.json();
    if (res.ok) setItens(j?.minuta?.itens || []);
  }

  async function addItem() {
    if (!editingId) {
      alert('Crie/salve a minuta primeiro.');
      return;
    }

    try {
      setError(null);

      const body: any = {
        produtoCode: String(novoItem.produtoCode || '').trim(),
        quantidade: Number(novoItem.quantidade || 1),
        observacao: String(novoItem.observacao || '').trim() || null,
      };

      if (!body.produtoCode) throw new Error('Informe o código do produto');

      const res = await fetch(`/api/minutas/${editingId}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao incluir item');

      setNovoItem({ produtoCode: '', quantidade: 1, observacao: '' });
      await reloadItens();
    } catch (e: any) {
      setError(e?.message || 'Falha ao incluir item');
    }
  }

  async function deleteItem(itemId: string) {
    const ok = confirm('Excluir este item? (volumes serão apagados)');
    if (!ok) return;

    try {
      setError(null);
      const res = await fetch(`/api/minutas/itens/${itemId}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao excluir item');
      await reloadItens();
    } catch (e: any) {
      setError(e?.message || 'Falha ao excluir item');
    }
  }

  async function gerarColeta() {
    if (!editingId) return;
    const clienteIdInput = prompt('Informe o ID do cliente para vincular a coleta:');
    if (!clienteIdInput) return;

    try {
      setError(null);
      setSaveMsg('');
      const res = await fetch(`/api/minutas/${editingId}/gerar-coleta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId: clienteIdInput.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao gerar coleta');
      setSaveMsg(`Coleta criada com sucesso! ID: ${j.coletaId}`);
    } catch (e: any) {
      setError(e?.message || 'Falha ao gerar coleta');
    }
  }

  const totalVolumes = itens.reduce((acc, it) => acc + (it.volumes?.length || 0), 0);

  return (
    <div style={{ padding: 16, color: '#1e293b', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 12, color: '#1A4A1A' }}>Minuta de Conferência</h1>

      <div style={{ marginBottom: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {editingId && (
          <>
            <Link
              href={`/carregamentos/${encodeURIComponent(editingId)}`}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                background: '#1A4A1A',
                color: '#fff',
                textDecoration: 'none',
                fontWeight: 900,
              }}
            >
              Checklist de carregamento
            </Link>
            <button
              onClick={gerarColeta}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                background: '#059669',
                color: '#fff',
                border: 'none',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              Gerar Coleta (enviar ao planejamento)
            </button>
            <button
              onClick={() => window.open(`/api/minutas/${editingId}/documento`, '_blank')}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                background: '#6366f1',
                color: '#fff',
                border: 'none',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              Imprimir Minuta
            </button>
            <button
              onClick={() => window.open(`/api/minutas/${editingId}/declaracao`, '_blank')}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                background: '#0ea5e9',
                color: '#fff',
                border: 'none',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              Declaração de Recebimento
            </button>
            <button
              onClick={() => window.open(`/api/minutas/${editingId}/recibo-coleta`, '_blank')}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                background: '#f59e0b',
                color: '#111',
                border: 'none',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              Recibo de Coleta
            </button>
          </>
        )}
      </div>

      {/* LISTA */}
      <div style={{ ...card, marginTop: 0 }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1A4A1A', marginBottom: 8 }}>Minutas</h2>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por NF, cliente, cidade, UF" style={inputStyle} />
          <select value={take} onChange={(e) => setTake(Number(e.target.value))} style={inputStyle as any}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>

          <button onClick={loadList} disabled={loadingList} style={{ ...btn, background: '#1A4A1A', color: 'white', opacity: loadingList ? 0.7 : 1 }}>
            {loadingList ? 'Atualizando…' : 'Atualizar lista'}
          </button>

          <button onClick={resetForm} style={{ ...btn, background: '#f1f5f9', color: '#1A4A1A', border: '1px solid #d1d5db' }}>
            Nova Minuta
          </button>
        </div>

        {listError && <div style={{ color: '#dc2626', marginBottom: 8 }}>{listError}</div>}

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>NF</th>
              <th style={th}>Cliente</th>
              <th style={th}>Cidade/UF</th>
              <th style={th}>Motorista</th>
              <th style={th}>Pedido</th>
              <th style={th}>Coletador</th>
              <th style={th}>Itens</th>
              <th style={th}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id}>
                <td style={td}>{m.nfNumero}</td>
                <td style={td}>{m.cliente}</td>
                <td style={td}>{m.cidade}/{m.uf}</td>
                <td style={td}>{m.motorista ?? '-'}</td>
                <td style={td}>{m.pedido ?? '-'}</td>
                <td style={td}>{m.coletador ?? '-'}</td>
                <td style={tdNum}>{m._count?.itens ?? '-'}</td>
                <td style={td}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => openMinuta(m.id)} style={{ ...btn, background: '#10b981', color: 'white' }}>
                      Abrir
                    </button>

                    <Link
                      href={`/carregamentos/${encodeURIComponent(m.id)}`}
                      style={{ ...btn, background: '#1A4A1A', color: 'white', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                    >
                      Checklist
                    </Link>

                    <button onClick={() => deleteMinuta(m.id)} style={{ ...btn, background: '#ef4444', color: 'white' }}>
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && !loadingList && (
              <tr>
                <td style={td} colSpan={8}>(Sem registros)</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* FORM MINUTA */}
      <div style={card}>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1A4A1A', marginBottom: 8 }}>{editingId ? 'Editar Minuta' : 'Nova Minuta'}</h2>

        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr 2fr 1fr', maxWidth: 1100 }}>
          <label>
            <div style={{ marginBottom: 4 }}>Número (opcional)</div>
            <input value={String(form.numero ?? '')} onChange={(e) => setForm({ ...form, numero: e.target.value })} style={inputStyle} />
          </label>
          <label>
            <div style={{ marginBottom: 4 }}>NF</div>
            <input value={String(form.nfNumero ?? '')} onChange={(e) => setForm({ ...form, nfNumero: e.target.value })} style={inputStyle} />
          </label>
          <label>
            <div style={{ marginBottom: 4 }}>Cliente</div>
            <input value={String(form.cliente ?? '')} onChange={(e) => setForm({ ...form, cliente: e.target.value })} style={inputStyle} />
          </label>
          <label>
            <div style={{ marginBottom: 4 }}>UF</div>
            <input value={String(form.uf ?? 'SP')} onChange={(e) => setForm({ ...form, uf: e.target.value })} style={inputStyle} />
          </label>

          <label>
            <div style={{ marginBottom: 4 }}>Cidade</div>
            <input value={String(form.cidade ?? '')} onChange={(e) => setForm({ ...form, cidade: e.target.value })} style={inputStyle} />
          </label>
          <label>
            <div style={{ marginBottom: 4 }}>Motorista (opcional)</div>
            <input value={String(form.motorista ?? '')} onChange={(e) => setForm({ ...form, motorista: e.target.value })} style={inputStyle} />
          </label>
          <label>
            <div style={{ marginBottom: 4 }}>Pedido (opcional)</div>
            <input value={String(form.pedido ?? '')} onChange={(e) => setForm({ ...form, pedido: e.target.value })} style={inputStyle} placeholder="Nº pedido" />
          </label>
          <label>
            <div style={{ marginBottom: 4 }}>Coletador (opcional)</div>
            <input value={String(form.coletador ?? '')} onChange={(e) => setForm({ ...form, coletador: e.target.value })} style={inputStyle} placeholder="Nome do coletador" />
          </label>
          <label>
            <div style={{ marginBottom: 4 }}>Data da Coleta (opcional)</div>
            <input type="date" value={String(form.dataColeta ?? '')} onChange={(e) => setForm({ ...form, dataColeta: e.target.value })} style={inputStyle} />
          </label>
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={saveMinuta} disabled={saving} style={{ ...btn, background: '#10b981', color: 'white', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar minuta'}
          </button>

          {editingId && (
            <div style={{ opacity: 0.85, fontSize: 12 }}>
              ID: <code>{editingId}</code>
            </div>
          )}

          {saveMsg && <div style={{ color: '#10b981', fontSize: 13 }}>{saveMsg}</div>}
          {error && <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>}

          {editingId && (
            <div style={{ marginLeft: 'auto', opacity: 0.85, fontSize: 13 }}>
              Volumes gerados: <b>{totalVolumes}</b>
            </div>
          )}
        </div>
      </div>

      {/* ITENS */}
      {editingId && (
        <div style={card}>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1A4A1A', marginBottom: 8 }}>Itens da NF</h2>

          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 120px 2fr auto', maxWidth: 1100 }}>
            <label>
              <div style={{ marginBottom: 4 }}>Código do Item</div>
              <input
                value={String(novoItem.produtoCode ?? '')}
                onChange={(e) => setNovoItem({ ...novoItem, produtoCode: e.target.value })}
                style={inputStyle}
                placeholder="Ex: INT-000001 ou código fornecedor"
              />
            </label>
            <label>
              <div style={{ marginBottom: 4 }}>Qtd</div>
              <input value={String(novoItem.quantidade ?? 1)} onChange={(e) => setNovoItem({ ...novoItem, quantidade: num(e.target.value) })} style={inputStyle} />
            </label>
            <label>
              <div style={{ marginBottom: 4 }}>Observação (opcional)</div>
              <input value={String(novoItem.observacao ?? '')} onChange={(e) => setNovoItem({ ...novoItem, observacao: e.target.value })} style={inputStyle} />
            </label>
            <button onClick={addItem} style={{ ...btn, background: '#2563eb', color: 'white', alignSelf: 'end' }}>
              Novo Código
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            {itens.length === 0 ? (
              <div style={{ opacity: 0.8 }}>(Sem itens)</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Código</th>
                    <th style={th}>Descrição</th>
                    <th style={th}>Qtd</th>
                    <th style={th}>Desmontável</th>
                    <th style={th}>Volumes</th>
                    <th style={th}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((it) => (
                    <tr key={it.id}>
                      <td style={td}>{it.produtoCode}</td>
                      <td style={td}>{it.produtoDescricao}</td>
                      <td style={tdNum}>{it.quantidade}</td>
                      <td style={td}>{it.desmontavel ? 'Sim' : 'Não'}</td>
                      <td style={tdNum}>{it.volumes?.length || 0}</td>
                      <td style={td}>
                        <button onClick={() => deleteItem(it.id)} style={{ ...btn, background: '#ef4444', color: 'white' }}>
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {itens.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1A4A1A', marginBottom: 8 }}>Etiquetas (Volumes)</h3>

              {(() => {
                const allVols = itens.flatMap((it) => it.volumes || []);
                const totalPesoKg = allVols.reduce((acc, v) => acc + (v.pesoKg ?? 0), 0);
                const totalAreaM2 = allVols.reduce((acc, v) => acc + (v.areaM2 ?? 0), 0);
                const totalVolumeM3 = allVols.reduce((acc, v) => acc + (v.volumeM3 ?? 0), 0);
                return (
                  <>
                    <div style={{ marginBottom: 8, fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <span><b>Total peso:</b> {totalPesoKg > 0 ? `${totalPesoKg.toFixed(2)} kg` : '-'}</span>
                      <span><b>Total área:</b> {totalAreaM2 > 0 ? `${totalAreaM2.toFixed(2)} m²` : '-'}</span>
                      <span><b>Total volume:</b> {totalVolumeM3 > 0 ? `${totalVolumeM3.toFixed(4)} m³` : '-'}</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={th}>Etiqueta</th>
                          <th style={th}>Tipo</th>
                          <th style={th}>Código</th>
                          <th style={th}>Descrição</th>
                          <th style={th}>Peso (kg)</th>
                          <th style={th}>Área (m²)</th>
                          <th style={th}>Dimensões (cm)</th>
                          <th style={th}>Volume (m³)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allVols.map((v) => (
                          <tr key={v.id}>
                            <td style={td}><code>{v.etiqueta}</code></td>
                            <td style={td}>{v.tipo}</td>
                            <td style={td}>{v.codigo}</td>
                            <td style={td}>{v.descricao}</td>
                            <td style={tdNum}>{v.pesoKg != null ? Number(v.pesoKg).toFixed(2) : '-'}</td>
                            <td style={tdNum}>{v.areaM2 != null ? Number(v.areaM2).toFixed(2) : '-'}</td>
                            <td style={tdNum}>{v.alturaCm ?? '-'} x {v.larguraCm ?? '-'} x {v.comprimentoCm ?? '-'}</td>
                            <td style={tdNum}>{v.volumeM3 != null ? Number(v.volumeM3).toFixed(4) : '-'}</td>
                          </tr>
                        ))}
                        {totalVolumes === 0 && (
                          <tr>
                            <td style={td} colSpan={8}>(Sem volumes)</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}