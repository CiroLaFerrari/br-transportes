'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

type Cliente = {
  id: string;
  razao: string;
  cnpj: string | null;
  uf: string;
  cidade: string;
  percentualFrete: number | null;
  endereco: string | null;
  localEntrega: string | null;
  particularidades: string | null;
  ajudantes: boolean;
  createdAt: string;
  updatedAt?: string;
  _count?: { coletas: number };
};

type Coleta = {
  id: string;
  nf: string;
  cidade: string;
  uf: string;
  valorFrete: number | null;
  pesoTotalKg: number | null;
  createdAt: string;
  updatedAt: string;
};

export default function ClientesPage() {
  const [list, setList] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(20);
  const [error, setError] = useState<string | null>(null);

  // form criar
  const [razao, setRazao] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [uf, setUf] = useState('');
  const [cidade, setCidade] = useState('');
  const [percentualFrete, setPercentualFrete] = useState('');
  const [endereco, setEndereco] = useState('');
  const [localEntrega, setLocalEntrega] = useState('');
  const [particularidades, setParticularidades] = useState('');
  const [ajudantes, setAjudantes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  // edição inline
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ razao: '', cnpj: '', uf: '', cidade: '', percentualFrete: '', endereco: '', localEntrega: '', particularidades: '', ajudantes: false });
  const [editSaving, setEditSaving] = useState(false);

  // coletas por cliente (on-demand)
  const [coletasByCliente, setColetasByCliente] = useState<Record<string, Coleta[]>>({});
  const [coletasLoading, setColetasLoading] = useState<Record<string, boolean>>({});
  const [coletasOpen, setColetasOpen] = useState<Record<string, boolean>>({});
  const [coletasError, setColetasError] = useState<Record<string, string | null>>({});

  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 10px',
    border: '1px solid #e2e8f0',
    background: '#f8fafc',
    fontWeight: 700,
    color: '#1e293b',
  };
  const td: React.CSSProperties = { padding: '8px 10px', border: '1px solid #e2e8f0', color: '#1e293b' };
  const sectionCard: React.CSSProperties = {
    marginTop: 16,
    padding: 12,
    border: '1px solid #e2e8f0',
    background: '#ffffff',
    borderRadius: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: 8,
    background: '#ffffff',
    color: '#1e293b',
    border: '1px solid #d1d5db',
    borderRadius: 6,
  };
  const btn: React.CSSProperties = { padding: '8px 12px', borderRadius: 6, border: 'none', cursor: 'pointer' };
  const editInput: React.CSSProperties = {
    padding: '4px 6px',
    background: '#ffffff',
    color: '#1e293b',
    border: '1px solid #3b82f6',
    borderRadius: 4,
    width: '100%',
  };

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const url = `/api/clientes?limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
      const res = await fetch(url, { cache: 'no-store' });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'Falha ao listar clientes');
      setList(Array.isArray(j) ? (j as Cliente[]) : []);
    } catch (e: any) {
      setError(e?.message || 'Falha ao listar clientes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createCliente() {
    try {
      setSaving(true);
      setSavedMsg('');
      setError(null);

      const body: any = {
        razao: razao.trim(),
        cnpj: cnpj.trim() || null,
        uf: uf.trim().toUpperCase(),
        cidade: cidade.trim(),
      };
      if (percentualFrete.trim()) body.percentualFrete = Number(percentualFrete);
      if (endereco.trim()) body.endereco = endereco.trim();
      if (localEntrega.trim()) body.localEntrega = localEntrega.trim();
      if (particularidades.trim()) body.particularidades = particularidades.trim();
      if (ajudantes) body.ajudantes = true;

      const res = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'Falha ao criar cliente');

      setSavedMsg('Cliente criado com sucesso.');
      setRazao('');
      setCnpj('');
      setUf('');
      setCidade('');
      setPercentualFrete('');
      setEndereco('');
      setLocalEntrega('');
      setParticularidades('');
      setAjudantes(false);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao criar cliente');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(c: Cliente) {
    setEditId(c.id);
    setEditForm({
      razao: c.razao,
      cnpj: c.cnpj || '',
      uf: c.uf,
      cidade: c.cidade,
      percentualFrete: c.percentualFrete != null ? String(c.percentualFrete) : '',
      endereco: c.endereco || '',
      localEntrega: c.localEntrega || '',
      particularidades: c.particularidades || '',
      ajudantes: c.ajudantes ?? false,
    });
  }

  function cancelEdit() {
    setEditId(null);
  }

  async function saveEdit() {
    if (!editId) return;
    try {
      setEditSaving(true);
      setError(null);
      const res = await fetch(`/api/clientes/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razao: editForm.razao.trim(),
          cnpj: editForm.cnpj.trim() || null,
          uf: editForm.uf.trim().toUpperCase(),
          cidade: editForm.cidade.trim(),
          percentualFrete: editForm.percentualFrete.trim() ? Number(editForm.percentualFrete) : null,
          endereco: editForm.endereco.trim() || null,
          localEntrega: editForm.localEntrega.trim() || null,
          particularidades: editForm.particularidades.trim() || null,
          ajudantes: editForm.ajudantes,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'Falha ao atualizar');
      setEditId(null);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao atualizar');
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteCliente(id: string, nome: string) {
    if (!confirm(`Excluir cliente "${nome}"?`)) return;
    try {
      setError(null);
      const res = await fetch(`/api/clientes/${id}`, { method: 'DELETE' });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'Falha ao excluir');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao excluir');
    }
  }

  async function toggleColetas(clienteId: string) {
    const isOpen = !!coletasOpen[clienteId];
    const nextOpen = { ...coletasOpen, [clienteId]: !isOpen };
    setColetasOpen(nextOpen);

    if (!isOpen && !coletasByCliente[clienteId]) {
      try {
        setColetasError((prev) => ({ ...prev, [clienteId]: null }));
        setColetasLoading((prev) => ({ ...prev, [clienteId]: true }));

        const res = await fetch(`/api/clientes/${encodeURIComponent(clienteId)}/coletas?limit=50`, { cache: 'no-store' });
        const j = await res.json().catch(() => null);
        if (!res.ok) throw new Error(j?.error || 'Falha ao listar coletas do cliente');

        setColetasByCliente((prev) => ({ ...prev, [clienteId]: Array.isArray(j) ? j : [] }));
      } catch (e: any) {
        setColetasError((prev) => ({ ...prev, [clienteId]: e?.message || 'Erro ao carregar coletas' }));
      } finally {
        setColetasLoading((prev) => ({ ...prev, [clienteId]: false }));
      }
    }
  }

  return (
    <div style={{ padding: 16, color: '#1e293b', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 12, color: '#1A4A1A' }}>Clientes</h1>

      {/* Form de cadastro */}
      <div style={{ ...sectionCard, marginTop: 0 }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1A4A1A', marginBottom: 8 }}>Cadastrar novo cliente</h2>

        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '2fr 1fr 0.6fr 1fr', maxWidth: 1000 }}>
          <label style={{ display: 'flex', flexDirection: 'column' }}>
            <span>Razão Social / Nome</span>
            <input value={razao} onChange={(e) => setRazao(e.target.value)} style={inputStyle} placeholder="Empresa XYZ Ltda" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column' }}>
            <span>CNPJ (opcional)</span>
            <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} style={inputStyle} placeholder="00.000.000/0000-00" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column' }}>
            <span>UF</span>
            <input value={uf} onChange={(e) => setUf(e.target.value)} style={inputStyle} placeholder="SP" maxLength={2} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column' }}>
            <span>Cidade</span>
            <input value={cidade} onChange={(e) => setCidade(e.target.value)} style={inputStyle} placeholder="São Paulo" />
          </label>
        </div>

        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 2fr 2fr', maxWidth: 1000, marginTop: 8 }}>
          <label style={{ display: 'flex', flexDirection: 'column' }}>
            <span>% Frete (opcional)</span>
            <input value={percentualFrete} onChange={(e) => setPercentualFrete(e.target.value)} style={inputStyle} placeholder="6.5" type="number" step="0.1" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column' }}>
            <span>Endereço (opcional)</span>
            <input value={endereco} onChange={(e) => setEndereco(e.target.value)} style={inputStyle} placeholder="Rua..." />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column' }}>
            <span>Local de Entrega (opcional)</span>
            <input value={localEntrega} onChange={(e) => setLocalEntrega(e.target.value)} style={inputStyle} placeholder="Galpão 3, Doca B" />
          </label>
        </div>

        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '3fr 1fr', maxWidth: 1000, marginTop: 8 }}>
          <label style={{ display: 'flex', flexDirection: 'column' }}>
            <span>Particularidades (opcional)</span>
            <input value={particularidades} onChange={(e) => setParticularidades(e.target.value)} style={inputStyle} placeholder="Restrições, horários, etc." />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 18 }}>
            <input type="checkbox" checked={ajudantes} onChange={(e) => setAjudantes(e.target.checked)} />
            <span>Precisa ajudantes</span>
          </label>
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={createCliente}
            disabled={saving}
            style={{ ...btn, background: '#22c55e', color: 'black', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Salvando…' : 'Criar cliente'}
          </button>
          {savedMsg && <span style={{ color: '#10b981' }}>{savedMsg}</span>}
          {error && <span style={{ color: '#dc2626' }}>{error}</span>}
        </div>
      </div>

      {/* Filtros */}
      <div style={sectionCard}>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1A4A1A', marginBottom: 8 }}>Lista de clientes</h2>

        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={inputStyle}
            placeholder="Buscar por nome, CNPJ, cidade, UF"
          />
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{ padding: 8, background: '#ffffff', color: '#1e293b', border: '1px solid #d1d5db', borderRadius: 6 } as any}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
          <button
            onClick={load}
            disabled={loading}
            style={{ ...btn, background: '#2563eb', color: 'white', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Atualizando…' : 'Atualizar'}
          </button>

          <Link href="/coletas" style={{ ...btn, background: '#f1f5f9', color: '#1A4A1A', border: '1px solid #d1d5db', textDecoration: 'none' }}>
            Ver coletas
          </Link>
        </div>

        {error && <div style={{ color: '#dc2626', marginBottom: 8 }}>{error}</div>}

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Razão / Nome</th>
              <th style={th}>CNPJ</th>
              <th style={th}>Cidade/UF</th>
              <th style={th}>% Frete</th>
              <th style={th}>Ajud.</th>
              <th style={th}># Coletas</th>
              <th style={th}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <React.Fragment key={c.id}>
                <tr>
                  {editId === c.id ? (
                    <>
                      <td style={td}>
                        <input
                          value={editForm.razao}
                          onChange={(e) => setEditForm((p) => ({ ...p, razao: e.target.value }))}
                          style={editInput}
                        />
                      </td>
                      <td style={td}>
                        <input
                          value={editForm.cnpj}
                          onChange={(e) => setEditForm((p) => ({ ...p, cnpj: e.target.value }))}
                          style={editInput}
                        />
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <input
                            value={editForm.cidade}
                            onChange={(e) => setEditForm((p) => ({ ...p, cidade: e.target.value }))}
                            style={{ ...editInput, flex: 1 }}
                            placeholder="Cidade"
                          />
                          <input
                            value={editForm.uf}
                            onChange={(e) => setEditForm((p) => ({ ...p, uf: e.target.value }))}
                            style={{ ...editInput, width: 50, flex: 'none' }}
                            maxLength={2}
                            placeholder="UF"
                          />
                        </div>
                      </td>
                      <td style={td}>
                        <input
                          value={editForm.percentualFrete}
                          onChange={(e) => setEditForm((p) => ({ ...p, percentualFrete: e.target.value }))}
                          style={{ ...editInput, width: 70 }}
                          type="number"
                          step="0.1"
                        />
                      </td>
                      <td style={td}>
                        <input
                          type="checkbox"
                          checked={editForm.ajudantes}
                          onChange={(e) => setEditForm((p) => ({ ...p, ajudantes: e.target.checked }))}
                        />
                      </td>
                      <td style={td}>{c._count?.coletas ?? 0}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button
                            onClick={saveEdit}
                            disabled={editSaving}
                            style={{ ...btn, background: '#22c55e', color: 'black', padding: '4px 8px', fontSize: 13 }}
                          >
                            {editSaving ? '…' : 'Salvar'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            style={{ ...btn, background: '#64748b', color: 'white', padding: '4px 8px', fontSize: 13 }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={td}>{c.razao}</td>
                      <td style={td}>{c.cnpj || '-'}</td>
                      <td style={td}>
                        {c.cidade}/{c.uf}
                      </td>
                      <td style={td}>{c.percentualFrete != null ? `${c.percentualFrete}%` : '-'}</td>
                      <td style={td}>{c.ajudantes ? 'Sim' : '-'}</td>
                      <td style={td}>{c._count?.coletas ?? 0}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button onClick={() => startEdit(c)} style={{ ...btn, background: '#f59e0b', color: 'black', padding: '4px 8px', fontSize: 13 }}>
                            Editar
                          </button>
                          <button onClick={() => deleteCliente(c.id, c.razao)} style={{ ...btn, background: '#ef4444', color: 'white', padding: '4px 8px', fontSize: 13 }}>
                            Excluir
                          </button>
                          <button onClick={() => toggleColetas(c.id)} style={{ ...btn, background: '#0ea5e9', color: 'black', padding: '4px 8px', fontSize: 13 }}>
                            {coletasOpen[c.id] ? 'Ocultar' : 'Coletas'}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>

                {editId === c.id && (
                  <tr>
                    <td style={td} colSpan={7}>
                      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '2fr 2fr 3fr', maxWidth: 900 }}>
                        <label>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>Endereço</div>
                          <input value={editForm.endereco} onChange={(e) => setEditForm((p) => ({ ...p, endereco: e.target.value }))} style={editInput} />
                        </label>
                        <label>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>Local de Entrega</div>
                          <input value={editForm.localEntrega} onChange={(e) => setEditForm((p) => ({ ...p, localEntrega: e.target.value }))} style={editInput} />
                        </label>
                        <label>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>Particularidades</div>
                          <input value={editForm.particularidades} onChange={(e) => setEditForm((p) => ({ ...p, particularidades: e.target.value }))} style={editInput} />
                        </label>
                      </div>
                    </td>
                  </tr>
                )}

                {coletasOpen[c.id] && (
                  <tr>
                    <td style={td} colSpan={7}>
                      {coletasLoading[c.id] && <div>Carregando coletas…</div>}
                      {coletasError[c.id] && <div style={{ color: '#dc2626' }}>{coletasError[c.id]}</div>}

                      {!coletasLoading[c.id] && !coletasError[c.id] && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
                          <thead>
                            <tr>
                              <th style={th}>NF</th>
                              <th style={th}>Cidade/UF</th>
                              <th style={th}>Frete (R$)</th>
                              <th style={th}>Peso (kg)</th>
                              <th style={th}>Detalhes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(coletasByCliente[c.id] || []).map((col) => (
                              <tr key={col.id}>
                                <td style={td}>{col.nf}</td>
                                <td style={td}>
                                  {col.cidade}/{col.uf}
                                </td>
                                <td style={td}>{col.valorFrete ?? '-'}</td>
                                <td style={td}>{col.pesoTotalKg ?? '-'}</td>
                                <td style={td}>
                                  <Link href={`/coletas/${col.id}`} style={{ color: '#1A4A1A', fontWeight: 600 }}>
                                    Abrir
                                  </Link>
                                </td>
                              </tr>
                            ))}
                            {(coletasByCliente[c.id]?.length ?? 0) === 0 && (
                              <tr>
                                <td style={td} colSpan={5}>
                                  (Sem coletas)
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}

            {list.length === 0 && !loading && (
              <tr>
                <td style={td} colSpan={7}>
                  (Sem registros)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
