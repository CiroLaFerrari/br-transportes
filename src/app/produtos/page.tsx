'use client';

import React, { useEffect, useMemo, useState } from 'react';

type Produto = {
  id: string;
  code: string;
  descricao: string;
  precoUnitario?: number | null;
  pesoKg?: number | null;
  alturaCm?: number | null;
  larguraCm?: number | null;
  comprimentoCm?: number | null;
  areaM2?: number | null;
  volumeM3?: number | null;
  embalado: boolean;
  tipoEmbalagem?: string | null;
  fragil: boolean;
  empilhavel: boolean;
  posicao?: string | null;
  desmontavel: boolean;
  createdAt: string;
};

type Componente = {
  id: string;
  createdAt: string;
  produtoId: string;
  nome: string;
  codigo: string;
  quantidade: number;
  pesoKg?: number | null;
  alturaCm?: number | null;
  larguraCm?: number | null;
  comprimentoCm?: number | null;
  areaM2?: number | null;
  volumeM3?: number | null;
  observacao?: string | null;
};

function num(v: any) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  return isFinite(n) ? n : '';
}

export default function ProdutosPage() {
  // listagem
  const [loadingList, setLoadingList] = useState(false);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(20);
  const [items, setItems] = useState<Produto[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  // edição
  const empty: Partial<Produto> = useMemo(
    () => ({
      code: '',
      descricao: '',
      precoUnitario: '',
      pesoKg: '',
      alturaCm: '',
      larguraCm: '',
      comprimentoCm: '',
      embalado: false,
      tipoEmbalagem: '',
      fragil: false,
      empilhavel: true,
      posicao: '',
      desmontavel: false,
    }),
    [],
  );

  const [form, setForm] = useState<Partial<Produto>>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // componentes
  const [comps, setComps] = useState<Componente[]>([]);
  const [compForm, setCompForm] = useState<Partial<Componente>>({
    codigo: '',
    nome: '',
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
  const labelStyle: React.CSSProperties = { marginBottom: 4, color: '#1e293b' };
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

      const url = `/api/produtos?limit=${encodeURIComponent(String(limit))}${q ? `&q=${encodeURIComponent(q)}` : ''}`;

      const res = await fetch(url);

      const text = await res.text();
      const j = text ? JSON.parse(text) : null;

      if (!res.ok) throw new Error(j?.error || 'Falha ao listar');

      const arr: any[] = Array.isArray(j) ? j : Array.isArray(j?.items) ? j.items : Array.isArray(j?.produtos) ? j.produtos : [];

      setItems(arr as Produto[]);
    } catch (e: any) {
      setListError(e?.message || 'Falha ao listar');
      setItems([]);
    } finally {
      setLoadingList(false);
    }
  }

  function resetForm() {
    setEditingId(null);
    setForm(empty);
    setComps([]);
    setCompForm({ codigo: '', nome: '', quantidade: 1, observacao: '' });
    setSaveMsg('');
    setError(null);
  }

  async function saveProduct() {
    try {
      setSaving(true);
      setError(null);
      setSaveMsg('');

      const body: any = {
        code: String(form.code || '').trim(),
        descricao: String(form.descricao || '').trim(),
        precoUnitario: form.precoUnitario === '' ? null : Number(form.precoUnitario),
        pesoKg: form.pesoKg === '' ? null : Number(form.pesoKg),
        alturaCm: form.alturaCm === '' ? null : Number(form.alturaCm),
        larguraCm: form.larguraCm === '' ? null : Number(form.larguraCm),
        comprimentoCm: form.comprimentoCm === '' ? null : Number(form.comprimentoCm),
        embalado: Boolean(form.embalado),
        tipoEmbalagem: form.tipoEmbalagem ? String(form.tipoEmbalagem) : null,
        fragil: Boolean(form.fragil),
        empilhavel: Boolean(form.empilhavel ?? true),
        posicao: form.posicao ? String(form.posicao) : null,
        desmontavel: Boolean(form.desmontavel),
      };

      if (!body.code) throw new Error('Informe código');
      if (!body.descricao) throw new Error('Informe descrição');

      if (editingId) {
        const res = await fetch(`/api/produtos/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || 'Falha ao editar');
        setSaveMsg('Produto atualizado.');
      } else {
        const res = await fetch('/api/produtos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || 'Falha ao criar');
        setEditingId(j.id);
        setSaveMsg('Produto criado.');
      }
      await loadList();
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function openProduct(id: string) {
    try {
      setError(null);
      setSaveMsg('');
      const res = await fetch(`/api/produtos/${id}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao carregar');
      const p = j as Produto & { componentes: Componente[] };

      setEditingId(p.id);
      setForm({
        code: p.code,
        descricao: p.descricao,
        precoUnitario: num(p.precoUnitario),
        pesoKg: num(p.pesoKg),
        alturaCm: num(p.alturaCm),
        larguraCm: num(p.larguraCm),
        comprimentoCm: num(p.comprimentoCm),
        embalado: p.embalado,
        tipoEmbalagem: p.tipoEmbalagem ?? '',
        fragil: p.fragil,
        empilhavel: p.empilhavel,
        posicao: p.posicao ?? '',
        desmontavel: p.desmontavel,
      });
      setComps(p.componentes || []);
      setCompForm({ codigo: '', nome: '', quantidade: 1, observacao: '' });
    } catch (e: any) {
      setError(e?.message || 'Falha ao abrir');
    }
  }

  async function deleteProduct(id: string) {
    const ok = confirm('Excluir produto? Essa ação não pode ser desfeita.');
    if (!ok) return;
    try {
      setError(null);
      const res = await fetch(`/api/produtos/${id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao excluir');
      if (editingId === id) resetForm();
      await loadList();
    } catch (e: any) {
      setError(e?.message || 'Falha ao excluir');
    }
  }

  async function loadComponents(id: string) {
    const res = await fetch(`/api/produtos/${id}/componentes`);
    const j = await res.json();
    if (res.ok) setComps(j);
  }

  async function addComponent() {
    if (!editingId) {
      alert('Salve o produto primeiro.');
      return;
    }

    try {
      setError(null);

      const body: any = {
        codigo: String(compForm.codigo || '').trim(),
        nome: String(compForm.nome || '').trim(),
        quantidade: Number(compForm.quantidade ?? 1),
        pesoKg: compForm.pesoKg === '' || compForm.pesoKg === undefined ? null : Number(compForm.pesoKg),
        alturaCm: compForm.alturaCm === '' || compForm.alturaCm === undefined ? null : Number(compForm.alturaCm),
        larguraCm: compForm.larguraCm === '' || compForm.larguraCm === undefined ? null : Number(compForm.larguraCm),
        comprimentoCm: compForm.comprimentoCm === '' || compForm.comprimentoCm === undefined ? null : Number(compForm.comprimentoCm),
        observacao: compForm.observacao ? String(compForm.observacao) : null,
      };

      if (!body.codigo) throw new Error('Informe o código do componente (obrigatório).');
      if (!body.nome) throw new Error('Informe nome do componente');

      const res = await fetch(`/api/produtos/${editingId}/componentes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao criar componente');

      await loadComponents(editingId);
      setCompForm({ codigo: '', nome: '', quantidade: 1, observacao: '' });
    } catch (e: any) {
      setError(e?.message || 'Falha ao adicionar componente');
    }
  }

  async function deleteComponent(compId: string) {
    const ok = confirm('Excluir este componente?');
    if (!ok) return;
    try {
      setError(null);
      const res = await fetch(`/api/componentes/${compId}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao excluir componente');
      if (editingId) await loadComponents(editingId);
    } catch (e: any) {
      setError(e?.message || 'Falha ao excluir');
    }
  }

  return (
    <div style={{ padding: 16, color: '#1e293b', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 12, color: '#1A4A1A' }}>Produtos</h1>

      {/* LISTA */}
      <div style={{ ...card, marginTop: 0 }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1A4A1A', marginBottom: 8 }}>Cadastro</h2>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código ou descrição" style={inputStyle} />
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={inputStyle as any}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>

          <button onClick={loadList} disabled={loadingList} style={{ ...btn, background: '#1A4A1A', color: 'white', opacity: loadingList ? 0.7 : 1 }}>
            {loadingList ? 'Atualizando…' : 'Atualizar lista'}
          </button>

          <button onClick={resetForm} style={{ ...btn, background: '#f1f5f9', color: '#1A4A1A', border: '1px solid #d1d5db' }}>
            Novo
          </button>
        </div>

        {listError && <div style={{ color: '#dc2626', marginBottom: 8 }}>{listError}</div>}

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Código</th>
              <th style={th}>Descrição</th>
              <th style={th}>Preço (R$)</th>
              <th style={th}>Peso (kg)</th>
              <th style={th}>L x C (cm)</th>
              <th style={th}>Área (m²)</th>
              <th style={th}>Volume (m³)</th>
              <th style={th}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td style={td}>{p.code}</td>
                <td style={td}>{p.descricao}</td>
                <td style={tdNum}>{p.precoUnitario != null ? p.precoUnitario.toFixed(2) : '-'}</td>
                <td style={tdNum}>{p.pesoKg ?? '-'}</td>
                <td style={tdNum}>
                  {p.larguraCm ?? '-'} x {p.comprimentoCm ?? '-'}
                </td>
                <td style={tdNum}>{p.areaM2 != null ? p.areaM2.toFixed(3) : '-'}</td>
                <td style={tdNum}>{p.volumeM3 != null ? p.volumeM3.toFixed(3) : '-'}</td>
                <td style={td}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => openProduct(p.id)} style={{ ...btn, background: '#10b981', color: 'white' }}>
                      Abrir
                    </button>
                    <button onClick={() => deleteProduct(p.id)} style={{ ...btn, background: '#ef4444', color: 'white' }}>
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {items.length === 0 && !loadingList && (
              <tr>
                <td style={td} colSpan={8}>
                  (Sem registros)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* FORM PRODUTO */}
      <div style={card}>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1A4A1A', marginBottom: 8 }}>{editingId ? 'Editar Produto' : 'Novo Produto'}</h2>

        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 2fr 1fr', maxWidth: 1000 }}>
          <label>
            <div style={labelStyle}>Código</div>
            <input value={String(form.code ?? '')} onChange={(e) => setForm({ ...form, code: e.target.value })} style={inputStyle} />
          </label>
          <label>
            <div style={labelStyle}>Descrição</div>
            <input value={String(form.descricao ?? '')} onChange={(e) => setForm({ ...form, descricao: e.target.value })} style={inputStyle} />
          </label>
          <label>
            <div style={labelStyle}>Peso (kg)</div>
            <input value={String(form.pesoKg ?? '')} onChange={(e) => setForm({ ...form, pesoKg: e.target.value as any })} style={inputStyle} />
          </label>

          <label>
            <div style={labelStyle}>Preço unitário (R$)</div>
            <input value={String(form.precoUnitario ?? '')} onChange={(e) => setForm({ ...form, precoUnitario: e.target.value as any })} style={inputStyle} />
          </label>

          <label>
            <div style={labelStyle}>Altura (cm)</div>
            <input value={String(form.alturaCm ?? '')} onChange={(e) => setForm({ ...form, alturaCm: e.target.value as any })} style={inputStyle} />
          </label>
          <label>
            <div style={labelStyle}>Largura (cm)</div>
            <input value={String(form.larguraCm ?? '')} onChange={(e) => setForm({ ...form, larguraCm: e.target.value as any })} style={inputStyle} />
          </label>
          <label>
            <div style={labelStyle}>Comprimento (cm)</div>
            <input value={String(form.comprimentoCm ?? '')} onChange={(e) => setForm({ ...form, comprimentoCm: e.target.value as any })} style={inputStyle} />
          </label>

          <label>
            <div style={labelStyle}>Embalado?</div>
            <select value={String(form.embalado ? '1' : '0')} onChange={(e) => setForm({ ...form, embalado: e.target.value === '1' })} style={inputStyle as any}>
              <option value="0">Não</option>
              <option value="1">Sim</option>
            </select>
          </label>
          <label>
            <div style={labelStyle}>Tipo de Embalagem</div>
            <select value={String(form.tipoEmbalagem ?? '')} onChange={(e) => setForm({ ...form, tipoEmbalagem: e.target.value })} style={inputStyle as any}>
              <option value="">—</option>
              <option value="CAIXA_MADEIRA">Caixa de Madeira</option>
              <option value="CAIXA_PAPELAO">Caixa de Papelão</option>
              <option value="AMARRADO">Amarrado</option>
              <option value="OUTROS">Outros</option>
            </select>
          </label>
          <label>
            <div style={labelStyle}>Frágil?</div>
            <select value={String(form.fragil ? '1' : '0')} onChange={(e) => setForm({ ...form, fragil: e.target.value === '1' })} style={inputStyle as any}>
              <option value="0">Não</option>
              <option value="1">Sim</option>
            </select>
          </label>

          <label>
            <div style={labelStyle}>Empilhável?</div>
            <select value={String(form.empilhavel ? '1' : '0')} onChange={(e) => setForm({ ...form, empilhavel: e.target.value === '1' })} style={inputStyle as any}>
              <option value="1">Sim</option>
              <option value="0">Não</option>
            </select>
          </label>
          <label>
            <div style={labelStyle}>Posição</div>
            <select value={String(form.posicao ?? '')} onChange={(e) => setForm({ ...form, posicao: e.target.value })} style={inputStyle as any}>
              <option value="">—</option>
              <option value="FRONTAL">Frontal</option>
              <option value="INDIFERENTE">Indiferente</option>
            </select>
          </label>
          <label>
            <div style={labelStyle}>Desmontável?</div>
            <select value={String(form.desmontavel ? '1' : '0')} onChange={(e) => setForm({ ...form, desmontavel: e.target.value === '1' })} style={inputStyle as any}>
              <option value="0">Não</option>
              <option value="1">Sim</option>
            </select>
          </label>
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={saveProduct} disabled={saving} style={{ ...btn, background: '#10b981', color: 'white', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar produto'}
          </button>

          {editingId && (
            <button
              onClick={() => {
                const w = window.open('', '_blank');
                if (!w) return;
                const f = form;
                const compRows = comps.map((c) =>
                  `<tr><td>${c.codigo}</td><td>${c.nome}</td><td>${c.quantidade}</td><td>${c.pesoKg ?? '-'}</td><td>${c.alturaCm ?? '-'} x ${c.larguraCm ?? '-'} x ${c.comprimentoCm ?? '-'}</td><td>${c.areaM2 != null ? c.areaM2.toFixed(3) : '-'}</td><td>${c.volumeM3 != null ? c.volumeM3.toFixed(3) : '-'}</td></tr>`
                ).join('');
                w.document.write(`<!DOCTYPE html><html><head><title>Produto ${f.code}</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#222}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:13px}th{background:#f1f5f9;font-weight:700}h1{font-size:20px}h2{font-size:16px;margin-top:20px}.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:13px}.grid b{display:block;color:#666;font-size:11px}@media print{.noprint{display:none}}</style></head><body>
                  <h1>Cadastro de Produto — ${f.code}</h1>
                  <div class="grid">
                    <div><b>Código</b>${f.code}</div>
                    <div><b>Descrição</b>${f.descricao}</div>
                    <div><b>Preço unitário (R$)</b>${f.precoUnitario != null ? Number(f.precoUnitario).toFixed(2) : '-'}</div>
                    <div><b>Peso (kg)</b>${f.pesoKg ?? '-'}</div>
                    <div><b>Altura (cm)</b>${f.alturaCm ?? '-'}</div>
                    <div><b>Largura (cm)</b>${f.larguraCm ?? '-'}</div>
                    <div><b>Comprimento (cm)</b>${f.comprimentoCm ?? '-'}</div>
                    <div><b>Embalado</b>${f.embalado ? 'Sim' : 'Não'}</div>
                    <div><b>Tipo Embalagem</b>${f.tipoEmbalagem || '-'}</div>
                    <div><b>Frágil</b>${f.fragil ? 'Sim' : 'Não'}</div>
                    <div><b>Empilhável</b>${f.empilhavel ? 'Sim' : 'Não'}</div>
                    <div><b>Posição</b>${f.posicao || '-'}</div>
                    <div><b>Desmontável</b>${f.desmontavel ? 'Sim' : 'Não'}</div>
                  </div>
                  ${comps.length > 0 ? `<h2>Componentes (${comps.length})</h2><table><thead><tr><th>Código</th><th>Nome</th><th>Qtd</th><th>Peso</th><th>Dimensões</th><th>Área m²</th><th>Vol m³</th></tr></thead><tbody>${compRows}</tbody></table>` : ''}
                  <div class="noprint" style="margin-top:20px"><button onclick="window.print()" style="padding:8px 16px;font-size:14px;cursor:pointer">Imprimir</button></div>
                </body></html>`);
                w.document.close();
              }}
              style={{ ...btn, background: '#6366f1', color: 'white' }}
            >
              Imprimir
            </button>
          )}

          <button
            onClick={() => {
              const rows = items.map((p) => [
                p.code, p.descricao, p.precoUnitario != null ? p.precoUnitario.toFixed(2) : '', p.pesoKg ?? '', p.alturaCm ?? '', p.larguraCm ?? '', p.comprimentoCm ?? '',
                p.areaM2 ?? '', p.volumeM3 ?? '', p.embalado ? 'Sim' : 'Não', p.tipoEmbalagem ?? '',
                p.fragil ? 'Sim' : 'Não', p.empilhavel ? 'Sim' : 'Não', p.posicao ?? '', p.desmontavel ? 'Sim' : 'Não',
              ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
              const header = 'Código,Descrição,Preço Unitário (R$),Peso (kg),Altura (cm),Largura (cm),Comprimento (cm),Área (m²),Volume (m³),Embalado,Tipo Embalagem,Frágil,Empilhável,Posição,Desmontável';
              const csv = '\uFEFF' + header + '\n' + rows.join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'produtos.csv'; a.click();
              URL.revokeObjectURL(url);
            }}
            disabled={items.length === 0}
            style={{ ...btn, background: '#F5BE16', color: '#1A4A1A', opacity: items.length === 0 ? 0.5 : 1 }}
          >
            Exportar Excel (CSV)
          </button>

          {editingId && (
            <div style={{ alignSelf: 'center', opacity: 0.8, fontSize: 12 }}>
              ID: <code>{editingId}</code>
            </div>
          )}

          {saveMsg && <div style={{ alignSelf: 'center', color: '#10b981', fontSize: 13 }}>{saveMsg}</div>}
          {error && <div style={{ alignSelf: 'center', color: '#dc2626', fontSize: 13 }}>{error}</div>}
        </div>
      </div>

      {/* COMPONENTES */}
      {editingId && (
        <div style={card}>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1A4A1A', marginBottom: 8 }}>Componentes</h2>

          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 2fr 120px 1fr 1fr', maxWidth: 1100, marginBottom: 8 }}>
            <label>
              <div style={labelStyle}>Código (obrigatório)</div>
              <input value={String(compForm.codigo ?? '')} onChange={(e) => setCompForm({ ...compForm, codigo: e.target.value })} style={inputStyle} placeholder="Ex: COMP-001" />
            </label>

            <label>
              <div style={labelStyle}>Nome</div>
              <input value={String(compForm.nome ?? '')} onChange={(e) => setCompForm({ ...compForm, nome: e.target.value })} style={inputStyle} />
            </label>

            <label>
              <div style={labelStyle}>Qtd</div>
              <input value={String(compForm.quantidade ?? 1)} onChange={(e) => setCompForm({ ...compForm, quantidade: Number(e.target.value || 1) })} style={inputStyle} />
            </label>

            <label>
              <div style={labelStyle}>Peso (kg)</div>
              <input value={String(compForm.pesoKg ?? '')} onChange={(e) => setCompForm({ ...compForm, pesoKg: e.target.value as any })} style={inputStyle} />
            </label>

            <label>
              <div style={labelStyle}>Alt (cm)</div>
              <input value={String(compForm.alturaCm ?? '')} onChange={(e) => setCompForm({ ...compForm, alturaCm: e.target.value as any })} style={inputStyle} />
            </label>
          </div>

          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr 1fr 2fr auto', maxWidth: 1100 }}>
            <label>
              <div style={labelStyle}>Larg (cm)</div>
              <input value={String(compForm.larguraCm ?? '')} onChange={(e) => setCompForm({ ...compForm, larguraCm: e.target.value as any })} style={inputStyle} />
            </label>

            <label>
              <div style={labelStyle}>Comp (cm)</div>
              <input value={String(compForm.comprimentoCm ?? '')} onChange={(e) => setCompForm({ ...compForm, comprimentoCm: e.target.value as any })} style={inputStyle} />
            </label>

            <label>
              <div style={labelStyle}>Área (m²)</div>
              <input value={String(compForm.areaM2 ?? '')} onChange={(e) => setCompForm({ ...compForm, areaM2: e.target.value as any })} style={inputStyle} placeholder="opcional" />
            </label>

            <label>
              <div style={labelStyle}>Observação</div>
              <input value={String(compForm.observacao ?? '')} onChange={(e) => setCompForm({ ...compForm, observacao: e.target.value })} style={inputStyle} />
            </label>

            <button onClick={addComponent} style={{ ...btn, background: '#2563eb', color: 'white', alignSelf: 'end' }}>
              Criar componente
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
            <thead>
              <tr>
                <th style={th}>Código</th>
                <th style={th}>Nome</th>
                <th style={th}>Qtd</th>
                <th style={th}>Peso (kg)</th>
                <th style={th}>Dimensões (cm)</th>
                <th style={th}>Área (m²)</th>
                <th style={th}>Volume (m³)</th>
                <th style={th}>Obs</th>
                <th style={th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c.id}>
                  <td style={td}>{c.codigo}</td>
                  <td style={td}>{c.nome}</td>
                  <td style={tdNum}>{c.quantidade}</td>
                  <td style={tdNum}>{c.pesoKg ?? '-'}</td>
                  <td style={tdNum}>
                    {c.alturaCm ?? '-'} x {c.larguraCm ?? '-'} x {c.comprimentoCm ?? '-'}
                  </td>
                  <td style={tdNum}>{c.areaM2 != null ? c.areaM2.toFixed(3) : '-'}</td>
                  <td style={tdNum}>{c.volumeM3 != null ? c.volumeM3.toFixed(3) : '-'}</td>
                  <td style={td}>{c.observacao ?? '-'}</td>
                  <td style={td}>
                    <button onClick={() => deleteComponent(c.id)} style={{ ...btn, background: '#ef4444', color: 'white' }}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}

              {comps.length === 0 && (
                <tr>
                  <td style={td} colSpan={9}>
                    (Sem componentes)
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
            Nota: “Código” é obrigatório e precisa ser único por produto (schema: @@unique([produtoId, codigo])).
          </div>
        </div>
      )}
    </div>
  );
}