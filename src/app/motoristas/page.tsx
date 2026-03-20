'use client';

import { useEffect, useState } from 'react';

type Motorista = {
  id: string;
  nome: string;
  documento?: string | null;
  disponibilidade: boolean;
  createdAt?: string;
};

export default function MotoristasPage() {
  const [list, setList] = useState<Motorista[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: '', documento: '', disponibilidade: true });

  // edição inline
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ nome: '', documento: '', disponibilidade: true });
  const [editSaving, setEditSaving] = useState(false);

  const cellStyle: React.CSSProperties = { padding: 8, borderBottom: '1px solid #e2e8f0' };
  const editInput: React.CSSProperties = {
    padding: '4px 6px',
    background: '#ffffff',
    color: '#1e293b',
    border: '1px solid #3b82f6',
    borderRadius: 4,
    width: '100%',
  };
  const btnSmall: React.CSSProperties = { padding: '4px 8px', border: 0, borderRadius: 6, cursor: 'pointer', fontSize: 13 };

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/motoristas?limit=100', { cache: 'no-store' });
      const json = await res.json();
      setList(Array.isArray(json) ? json : []);
    } catch {
      setMsg('Falha ao carregar motoristas');
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await fetch('/api/motoristas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome,
          documento: form.documento || null,
          disponibilidade: Boolean(form.disponibilidade),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg(json?.error || 'Falha ao criar');
        return;
      }
      setForm({ nome: '', documento: '', disponibilidade: true });
      await load();
      setMsg('Motorista criado com sucesso.');
    } catch {
      setMsg('Falha ao criar');
    }
  };

  const excluir = async (id: string) => {
    if (!confirm('Excluir este motorista?')) return;
    try {
      const res = await fetch(`/api/motoristas/${id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        alert(json?.error || 'Erro ao excluir');
        return;
      }
      await load();
    } catch {
      alert('Erro ao excluir');
    }
  };

  function startEdit(m: Motorista) {
    setEditId(m.id);
    setEditForm({ nome: m.nome, documento: m.documento || '', disponibilidade: m.disponibilidade });
  }

  async function saveEdit() {
    if (!editId) return;
    try {
      setEditSaving(true);
      setMsg(null);
      const res = await fetch(`/api/motoristas/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: editForm.nome.trim(),
          documento: editForm.documento.trim() || null,
          disponibilidade: editForm.disponibilidade,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg(json?.error || 'Falha ao atualizar');
        return;
      }
      setEditId(null);
      await load();
      setMsg('Motorista atualizado com sucesso.');
    } catch {
      setMsg('Falha ao atualizar');
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleDisponibilidade(m: Motorista) {
    try {
      setMsg(null);
      const res = await fetch(`/api/motoristas/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disponibilidade: !m.disponibilidade }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setMsg(json?.error || 'Falha ao alterar disponibilidade');
        return;
      }
      await load();
    } catch {
      setMsg('Falha ao alterar disponibilidade');
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '20px auto', padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 12, color: '#1A4A1A' }}>Motoristas</h1>

      <form
        onSubmit={onSubmit}
        style={{
          display: 'grid',
          gap: 8,
          gridTemplateColumns: '1fr 300px 160px',
          alignItems: 'end',
          marginBottom: 16,
          background: '#ffffff',
          padding: 12,
          borderRadius: 8,
          border: '1px solid #e2e8f0',
        }}
      >
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#64748b' }}>Nome</label>
          <input
            name="nome"
            value={form.nome}
            onChange={onChange}
            placeholder="Ex.: João Silva"
            style={{ width: '100%', padding: 8, background: '#ffffff', color: '#1e293b', border: '1px solid #d1d5db', borderRadius: 6 }}
            required
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#64748b' }}>Documento (opcional)</label>
          <input
            name="documento"
            value={form.documento}
            onChange={onChange}
            placeholder="Ex.: CPF/CNH"
            style={{ width: '100%', padding: 8, background: '#ffffff', color: '#1e293b', border: '1px solid #d1d5db', borderRadius: 6 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            name="disponibilidade"
            checked={form.disponibilidade}
            onChange={onChange}
            id="disp"
          />
          <label htmlFor="disp" style={{ color: '#64748b', userSelect: 'none' }}>Disponível</label>
        </div>

        <div style={{ gridColumn: '1 / span 3', display: 'flex', gap: 8 }}>
          <button type="submit" style={{ padding: '8px 12px', background: '#2563eb', color: 'white', border: 0, borderRadius: 6 }}>
            Criar motorista
          </button>
          {msg && <span style={{ color: msg.includes('sucesso') ? '#9bdc9b' : '#f59e0b' }}>{msg}</span>}
        </div>
      </form>

      {loading ? (
        <div>Carregando...</div>
      ) : (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#ffffff', color: '#64748b' }}>
                <th style={{ textAlign: 'left', ...cellStyle }}>Nome</th>
                <th style={{ textAlign: 'left', ...cellStyle }}>Documento</th>
                <th style={{ textAlign: 'left', ...cellStyle }}>Disponível</th>
                <th style={{ textAlign: 'left', ...cellStyle }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} style={{ background: '#ffffff', color: '#1e293b' }}>
                  {editId === m.id ? (
                    <>
                      <td style={cellStyle}>
                        <input value={editForm.nome} onChange={(e) => setEditForm((p) => ({ ...p, nome: e.target.value }))} style={editInput} />
                      </td>
                      <td style={cellStyle}>
                        <input value={editForm.documento} onChange={(e) => setEditForm((p) => ({ ...p, documento: e.target.value }))} style={editInput} />
                      </td>
                      <td style={cellStyle}>
                        <input
                          type="checkbox"
                          checked={editForm.disponibilidade}
                          onChange={(e) => setEditForm((p) => ({ ...p, disponibilidade: e.target.checked }))}
                        />
                      </td>
                      <td style={cellStyle}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={saveEdit} disabled={editSaving} style={{ ...btnSmall, background: '#22c55e', color: 'black' }}>
                            {editSaving ? '…' : 'Salvar'}
                          </button>
                          <button onClick={() => setEditId(null)} style={{ ...btnSmall, background: '#64748b', color: 'white' }}>
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={cellStyle}>{m.nome}</td>
                      <td style={cellStyle}>{m.documento || '-'}</td>
                      <td style={cellStyle}>
                        <button
                          onClick={() => toggleDisponibilidade(m)}
                          style={{
                            ...btnSmall,
                            background: m.disponibilidade ? '#22c55e' : '#64748b',
                            color: m.disponibilidade ? 'black' : 'white',
                          }}
                        >
                          {m.disponibilidade ? 'Sim' : 'Não'}
                        </button>
                      </td>
                      <td style={cellStyle}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => startEdit(m)} style={{ ...btnSmall, background: '#f59e0b', color: 'black' }}>
                            Editar
                          </button>
                          <button onClick={() => excluir(m.id)} style={{ ...btnSmall, background: '#ef4444', color: 'white' }}>
                            Excluir
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 16, color: '#64748b', textAlign: 'center' }}>Nenhum motorista cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
