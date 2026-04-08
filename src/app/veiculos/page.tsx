'use client';

import { useEffect, useState, useRef } from 'react';

type Veiculo = {
  id: string;
  placa: string;
  capacidadeKg: number;
  capacidadeM3: number;
  compCm: number;
  largCm: number;
  altCm: number;
  numEixos: number | null;
  licenciamentoUrl: string | null;
  licenciamentoVencimento: string | null;
  documentosUrl: string | null;
  documentosVencimento: string | null;
};

function docExpiryBadge(licVenc: string | null, docVenc: string | null): React.ReactNode {
  const now = new Date();
  const badges: React.ReactNode[] = [];

  const check = (dateStr: string | null, label: string) => {
    if (!dateStr) return;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return;
    const diffMs = d.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays < 0) {
      badges.push(
        <span key={label} style={{ display: 'inline-block', background: '#ef4444', color: 'white', fontSize: 11, padding: '2px 6px', borderRadius: 4, marginLeft: 4 }}>
          {label} vencido
        </span>
      );
    } else if (diffDays <= 30) {
      badges.push(
        <span key={label} style={{ display: 'inline-block', background: '#f59e0b', color: 'black', fontSize: 11, padding: '2px 6px', borderRadius: 4, marginLeft: 4 }}>
          {label} vence em {Math.ceil(diffDays)}d
        </span>
      );
    }
  };

  check(licVenc, 'Lic.');
  check(docVenc, 'Doc.');
  return badges.length > 0 ? <>{badges}</> : null;
}

function toDateInputValue(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/* Styled upload button component */
function FileUploadBtn({ label, onUploaded, currentUrl, accent }: {
  label: string;
  onUploaded: (url: string) => void;
  currentUrl?: string;
  accent?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const color = accent || '#2563eb';

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const j = await res.json();
      if (res.ok) onUploaded(j.url);
    } catch { /* ignore */ } finally {
      setUploading(false);
      if (ref.current) ref.current.value = '';
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input ref={ref} type="file" accept=".pdf,image/*" onChange={handleFile} style={{ display: 'none' }} />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={uploading}
        style={{
          padding: '5px 12px',
          background: uploading ? '#94a3b8' : color,
          color: 'white',
          border: 0,
          borderRadius: 6,
          cursor: uploading ? 'wait' : 'pointer',
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        {uploading ? 'Enviando...' : label}
      </button>
      {currentUrl && (
        <a href={currentUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color, fontWeight: 600, textDecoration: 'none' }}>
          Ver
        </a>
      )}
    </div>
  );
}

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
    numEixos: '',
    licenciamentoUrl: '',
    licenciamentoVencimento: '',
    documentosUrl: '',
    documentosVencimento: '',
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
    numEixos: '',
    licenciamentoUrl: '',
    licenciamentoVencimento: '',
    documentosUrl: '',
    documentosVencimento: '',
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

    const payload: Record<string, unknown> = { placa, capacidadeKg, capacidadeM3, compCm, largCm, altCm };

    if (form.numEixos.trim()) {
      const n = Number(form.numEixos);
      if (!Number.isInteger(n)) return setMsg('Num. Eixos deve ser inteiro.');
      payload.numEixos = n;
    }
    if (form.licenciamentoUrl.trim()) payload.licenciamentoUrl = form.licenciamentoUrl.trim();
    if (form.licenciamentoVencimento) payload.licenciamentoVencimento = form.licenciamentoVencimento;
    if (form.documentosUrl.trim()) payload.documentosUrl = form.documentosUrl.trim();
    if (form.documentosVencimento) payload.documentosVencimento = form.documentosVencimento;

    try {
      const res = await fetch('/api/veiculos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg(json?.error || 'Falha ao criar veículo');
        return;
      }
      setForm({
        placa: '', capacidadeKg: '', capacidadeM3: '', compCm: '', largCm: '', altCm: '',
        numEixos: '', licenciamentoUrl: '', licenciamentoVencimento: '', documentosUrl: '', documentosVencimento: '',
      });
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
      numEixos: v.numEixos != null ? String(v.numEixos) : '',
      licenciamentoUrl: v.licenciamentoUrl ?? '',
      licenciamentoVencimento: toDateInputValue(v.licenciamentoVencimento),
      documentosUrl: v.documentosUrl ?? '',
      documentosVencimento: toDateInputValue(v.documentosVencimento),
    });
  }

  async function saveEdit() {
    if (!editId) return;
    try {
      setEditSaving(true);
      setMsg(null);

      const payload: Record<string, unknown> = {
        placa: editForm.placa.trim().toUpperCase(),
        capacidadeKg: Number(editForm.capacidadeKg),
        capacidadeM3: Number(editForm.capacidadeM3),
        compCm: Number(editForm.compCm),
        largCm: Number(editForm.largCm),
        altCm: Number(editForm.altCm),
        numEixos: editForm.numEixos.trim() ? Number(editForm.numEixos) : null,
        licenciamentoUrl: editForm.licenciamentoUrl.trim() || null,
        licenciamentoVencimento: editForm.licenciamentoVencimento || null,
        documentosUrl: editForm.documentosUrl.trim() || null,
        documentosVencimento: editForm.documentosVencimento || null,
      };

      const res = await fetch(`/api/veiculos/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  const inputField = (name: string, value: string, placeholder: string, label: string, inputMode?: string, type?: string, required?: boolean) => (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: '#64748b' }}>{label}</label>
      <input
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        inputMode={inputMode as any}
        type={type || 'text'}
        style={{ width: '100%', padding: 8, background: '#ffffff', color: '#1e293b', border: '1px solid #d1d5db', borderRadius: 6 }}
        required={required !== false}
      />
    </div>
  );

  return (
    <div style={{ maxWidth: 1400, margin: '20px auto', padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 12, color: '#1A4A1A' }}>Veículos</h1>

      <form
        onSubmit={onSubmit}
        style={{
          display: 'grid',
          gap: 8,
          gridTemplateColumns: '120px 140px 140px 100px 100px 100px 80px',
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
        {inputField('numEixos', form.numEixos, '2', 'Eixos', 'numeric', 'text', false)}

        {/* Row 2: Upload buttons + date fields */}
        <div style={{ gridColumn: '1 / span 2' }}>
          <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Licenciamento (PDF)</label>
          <FileUploadBtn
            label="Enviar Licenciamento"
            currentUrl={form.licenciamentoUrl}
            onUploaded={(url) => { setForm(prev => ({ ...prev, licenciamentoUrl: url })); setMsg('Licenciamento enviado.'); }}
            accent="#1A4A1A"
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#64748b' }}>Venc. Licenciamento</label>
          <input
            name="licenciamentoVencimento"
            value={form.licenciamentoVencimento}
            onChange={onChange}
            type="date"
            style={{ width: '100%', padding: 8, background: '#ffffff', color: '#1e293b', border: '1px solid #d1d5db', borderRadius: 6 }}
          />
        </div>
        <div style={{ gridColumn: '4 / span 2' }}>
          <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Documentos (PDF)</label>
          <FileUploadBtn
            label="Enviar Documentos"
            currentUrl={form.documentosUrl}
            onUploaded={(url) => { setForm(prev => ({ ...prev, documentosUrl: url })); setMsg('Documento enviado.'); }}
            accent="#1A4A1A"
          />
        </div>
        <div style={{ gridColumn: '6 / span 2' }}>
          <label style={{ display: 'block', fontSize: 12, color: '#64748b' }}>Venc. Documentos</label>
          <input
            name="documentosVencimento"
            value={form.documentosVencimento}
            onChange={onChange}
            type="date"
            style={{ width: '100%', padding: 8, background: '#ffffff', color: '#1e293b', border: '1px solid #d1d5db', borderRadius: 6 }}
          />
        </div>

        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
          <button type="submit" style={{ padding: '8px 16px', background: '#1A4A1A', color: '#F5BE16', border: 0, borderRadius: 6, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            Criar veículo
          </button>
          {msg && <span style={{ color: msg.includes('sucesso') || msg.includes('enviado') ? '#16a34a' : '#f59e0b', alignSelf: 'center' }}>{msg}</span>}
        </div>
      </form>

      {loading ? (
        <div>Carregando...</div>
      ) : (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ background: '#ffffff', color: '#64748b' }}>
                <th style={{ textAlign: 'left', ...cellStyle }}>Placa</th>
                <th style={{ textAlign: 'left', ...cellStyle }}>Cap. (kg)</th>
                <th style={{ textAlign: 'left', ...cellStyle }}>Cap. (m³)</th>
                <th style={{ textAlign: 'left', ...cellStyle }}>Comp.</th>
                <th style={{ textAlign: 'left', ...cellStyle }}>Larg.</th>
                <th style={{ textAlign: 'left', ...cellStyle }}>Alt.</th>
                <th style={{ textAlign: 'left', ...cellStyle }}>Eixos</th>
                <th style={{ textAlign: 'left', ...cellStyle }}>Docs</th>
                <th style={{ textAlign: 'left', ...cellStyle }}>Alertas</th>
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
                        <input value={editForm.numEixos} onChange={(e) => setEditForm((p) => ({ ...p, numEixos: e.target.value }))} style={editInput} inputMode="numeric" />
                      </td>
                      {/* Docs column - upload buttons for both files */}
                      <td style={cellStyle}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div>
                            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Licenciamento</div>
                            <FileUploadBtn
                              label="Enviar"
                              currentUrl={editForm.licenciamentoUrl}
                              onUploaded={(url) => setEditForm(p => ({ ...p, licenciamentoUrl: url }))}
                              accent="#1A4A1A"
                            />
                            <input
                              value={editForm.licenciamentoVencimento}
                              onChange={(e) => setEditForm((p) => ({ ...p, licenciamentoVencimento: e.target.value }))}
                              style={{ ...editInput, marginTop: 4, fontSize: 11 }}
                              type="date"
                              title="Venc. Licenciamento"
                            />
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Documentos</div>
                            <FileUploadBtn
                              label="Enviar"
                              currentUrl={editForm.documentosUrl}
                              onUploaded={(url) => setEditForm(p => ({ ...p, documentosUrl: url }))}
                              accent="#1A4A1A"
                            />
                            <input
                              value={editForm.documentosVencimento}
                              onChange={(e) => setEditForm((p) => ({ ...p, documentosVencimento: e.target.value }))}
                              style={{ ...editInput, marginTop: 4, fontSize: 11 }}
                              type="date"
                              title="Venc. Documentos"
                            />
                          </div>
                        </div>
                      </td>
                      <td style={cellStyle}></td>
                      <td style={cellStyle}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={saveEdit} disabled={editSaving} style={{ ...btnSmall, background: '#22c55e', color: 'black' }}>
                            {editSaving ? '...' : 'Salvar'}
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
                      <td style={cellStyle}>{v.numEixos ?? '—'}</td>
                      <td style={cellStyle}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {v.licenciamentoUrl ? (
                            <a href={v.licenciamentoUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', textDecoration: 'none', padding: '2px 8px', background: '#dbeafe', borderRadius: 4, display: 'inline-block' }}>
                              Licenciamento
                            </a>
                          ) : (
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>Sem lic.</span>
                          )}
                          {v.documentosUrl ? (
                            <a href={v.documentosUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', textDecoration: 'none', padding: '2px 8px', background: '#dbeafe', borderRadius: 4, display: 'inline-block' }}>
                              Documentos
                            </a>
                          ) : (
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>Sem doc.</span>
                          )}
                        </div>
                      </td>
                      <td style={cellStyle}>
                        {docExpiryBadge(v.licenciamentoVencimento, v.documentosVencimento) || (
                          <span style={{ color: '#94a3b8', fontSize: 12 }}>OK</span>
                        )}
                      </td>
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
                  <td colSpan={10} style={{ padding: 16, color: '#64748b', textAlign: 'center' }}>
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
