'use client';

import { useEffect, useState } from 'react';

type Veiculo = {
  id: string;
  placa: string;
  capacidadeKg: number;
  capacidadeM3: number;
  compCm: number;
  largCm: number;
  altCm: number;
};

export default function VeiculosPage() {
  const [list, setList] = useState<Veiculo[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    placa: '',
    capacidadeKg: '',
    capacidadeM3: '',
    compCm: '',
    largCm: '',
    altCm: '',
  });

  // edição inline
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    placa: '',
    capacidadeKg: '',
    capacidadeM3: '',
    compCm: '',
    largCm: '',
    altCm: '',
  });
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
      const res = await fetch('/api/veiculos?limit=100', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      setList(Array.isArray(json) ? json : []);
      setMsg(null);
    } catch {
      setMsg('Falha ao carregar veículos');
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    const placa = form.placa.trim().toUpperCase();
    const capacidadeKg = Number(form.capacidadeKg);
    const capacidadeM3 = Number(form.capacidadeM3);
    const compCm = Number(form.compCm);
    const largCm = Number(form.largCm);
    const altCm = Number(form.altCm);

    if (!placa) return setMsg('Placa é obrigatória.');
    if (!Number.isInteger(capacidadeKg)) return setMsg('capacidadeKg deve ser inteiro.');
    if (!Number.isFinite(capacidadeM3)) return setMsg('capacidadeM3 deve ser número.');
    if (!Number.isInteger(compCm) || !Number.isInteger(largCm) || !Number.isInteger(altCm)) {
      return setMsg('compCm, largCm e altCm devem ser inteiros.');
    }

    try {
      const res = await fetch('/api/veiculos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa, capacidadeKg, capacidadeM3, compCm, largCm, altCm }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg(json?.error || 'Falha ao criar veículo');
        return;
      }
      setForm({ placa: '', capacidadeKg: '', capacidadeM3: '', compCm: '', largCm: '', altCm: '' });
      await load();
      setMsg('Veículo criado com sucesso.');
    } catch {
      setMsg('Falha ao criar veículo');
    }
  };

  const excluir = async (id: string) => {
    if (!confirm('Excluir este veículo?')) return;
    try {
      const res = await fetch(`/api/veiculos/${id}`, { method: 'DELETE' });
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

  function startEdit(v: Veiculo) {
    setEditId(v.id);
    setEditForm({
      placa: v.placa,
      capacidadeKg: String(v.capacidadeKg),
      capacidadeM3: String(v.capacidadeM3),
      compCm: String(v.compCm),
      largCm: String(v.largCm),
      altCm: String(v.altCm),
    });
  }

  async function saveEdit() {
    if (!editId) return;
    try {
      setEditSaving(true);
      setMsg(null);
      const res = await fetch(`/api/veiculos/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placa: editForm.placa.trim().toUpperCase(),
          capacidadeKg: Number(editForm.capacidadeKg),
          capacidadeM3: Number(editForm.capacidadeM3),
          compCm: Number(editForm.compCm),
          largCm: Number(editForm.largCm),
          altCm: Number(editForm.altCm),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg(json?.error || 'Falha ao atualizar');
        return;
      }
      setEditId(null);
      await load();
      setMsg('Veículo atualizado com sucesso.');
    } catch {
      setMsg('Falha ao atualizar');
    } finally {
      setEditSaving(false);
    }
  }

  const inputField = (name: string, value: string, placeholder: string, label: string, inputMode?: string) => (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: '#64748b' }}>{label}</label>
      <input
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        inputMode={inputMode as any}
        style={{ width: '100%', padding: 8, background: '#ffffff', color: '#1e293b', border: '1px solid #d1d5db', borderRadius: 6 }}
        required
      />
    </div>
  );

  return (
    <div style={{ maxWidth: 1200, margin: '20px auto', padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 12, color: '#1A4A1A' }}>Veículos</h1>

      <form
        onSubmit={onSubmit}
        style={{
          display: 'grid',
          gap: 8,
          gridTemplateColumns: '120px 140px 140px 120px 120px 120px',
          alignItems: 'end',
          marginBottom: 16,
          background: '#ffffff',
          padding: 12,
          borderRadius: 8,
          border: '1px solid #e2e8f0',
        }}
      >
        {inputField('placa', form.placa, 'ABC1D23', 'Placa')}
        {inputField('capacidadeKg', form.capacidadeKg, '1200', 'Capacidade (kg)', 'numeric')}
        {inputField('capacidadeM3', form.capacidadeM3, '10.5', 'Capacidade (m³)', 'decimal')}
        {inputField('compCm', form.compCm, '300', 'Comp. (cm)', 'numeric')}
        {inputField('largCm', form.largCm, '180', 'Larg. (cm)', 'numeric')}
        {inputField('altCm', form.altCm, '160', 'Alt. (cm)', 'numeric')}

        <div style={{ gridColumn: '1 / span 6', display: 'flex', gap: 8 }}>
          <button type="submit" style={{ padding: '8px 12px', background: '#2563eb', color: 'white', border: 0, borderRadius: 6 }}>
            Criar veículo
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
                <th style={{ textAlign: 'left', ...cellStyle }}>Placa</th>
                <th style={{ textAlign: 'left', ...cellStyle }}>Cap. (kg)</th>
                <th style={{ textAlign: 'left', ...cellStyle }}>Cap. (m³)</th>
                <th style={{ textAlign: 'left', ...cellStyle }}>Comp. (cm)</th>
                <th style={{ textAlign: 'left', ...cellStyle }}>Larg. (cm)</th>
                <th style={{ textAlign: 'left', ...cellStyle }}>Alt. (cm)</th>
                <th style={{ textAlign: 'left', ...cellStyle }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.map((v) => (
                <tr key={v.id} style={{ background: '#ffffff', color: '#1e293b' }}>
                  {editId === v.id ? (
                    <>
                      <td style={cellStyle}>
                        <input value={editForm.placa} onChange={(e) => setEditForm((p) => ({ ...p, placa: e.target.value }))} style={editInput} />
                      </td>
                      <td style={cellStyle}>
                        <input value={editForm.capacidadeKg} onChange={(e) => setEditForm((p) => ({ ...p, capacidadeKg: e.target.value }))} style={editInput} inputMode="numeric" />
                      </td>
                      <td style={cellStyle}>
                        <input value={editForm.capacidadeM3} onChange={(e) => setEditForm((p) => ({ ...p, capacidadeM3: e.target.value }))} style={editInput} inputMode="decimal" />
                      </td>
                      <td style={cellStyle}>
                        <input value={editForm.compCm} onChange={(e) => setEditForm((p) => ({ ...p, compCm: e.target.value }))} style={editInput} inputMode="numeric" />
                      </td>
                      <td style={cellStyle}>
                        <input value={editForm.largCm} onChange={(e) => setEditForm((p) => ({ ...p, largCm: e.target.value }))} style={editInput} inputMode="numeric" />
                      </td>
                      <td style={cellStyle}>
                        <input value={editForm.altCm} onChange={(e) => setEditForm((p) => ({ ...p, altCm: e.target.value }))} style={editInput} inputMode="numeric" />
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
                      <td style={{ ...cellStyle, fontWeight: 600 }}>{v.placa}</td>
                      <td style={cellStyle}>{Intl.NumberFormat('pt-BR').format(v.capacidadeKg)}</td>
                      <td style={cellStyle}>{Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(v.capacidadeM3)}</td>
                      <td style={cellStyle}>{v.compCm}</td>
                      <td style={cellStyle}>{v.largCm}</td>
                      <td style={cellStyle}>{v.altCm}</td>
                      <td style={cellStyle}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => startEdit(v)} style={{ ...btnSmall, background: '#f59e0b', color: 'black' }}>
                            Editar
                          </button>
                          <button onClick={() => excluir(v.id)} style={{ ...btnSmall, background: '#ef4444', color: 'white' }}>
                            Excluir
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 16, color: '#64748b', textAlign: 'center' }}>
                    Nenhum veículo cadastrado.
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
