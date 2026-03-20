'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type TipoCodigo = 'FORNECEDOR' | 'INTERNO';

type ComponenteForm = {
  codigo: string;
  nome: string;
  pesoKg: string;
  comprimentoCm: string;
  larguraCm: string;
  alturaCm: string;
  quantidade: string;
  observacao: string;
};

type ProdutoForm = {
  tipoCodigo: TipoCodigo;
  code: string;
  descricao: string;

  pesoKg: string;
  comprimentoCm: string;
  larguraCm: string;
  alturaCm: string;

  embalado: boolean;
  tipoEmbalagem: string;
  fragil: boolean;
  empilhavel: boolean;
  posicao: string;
  desmontavel: boolean;

  componentes: ComponenteForm[];
};

async function safeJson(res: Response) {
  return await res.json().catch(() => null);
}

function fmtCalcAreaM2(largCm: string, compCm: string) {
  const l = Number(largCm);
  const c = Number(compCm);
  if (!Number.isFinite(l) || !Number.isFinite(c) || l <= 0 || c <= 0) return '—';
  const area = (l / 100) * (c / 100);
  return area.toFixed(4);
}

function fmtCalcVolM3(altCm: string, largCm: string, compCm: string) {
  const a = Number(altCm);
  const l = Number(largCm);
  const c = Number(compCm);
  if (!Number.isFinite(a) || !Number.isFinite(l) || !Number.isFinite(c) || a <= 0 || l <= 0 || c <= 0) return '—';
  const vol = (a / 100) * (l / 100) * (c / 100);
  return vol.toFixed(6);
}

function nextCompCode(existing: string[]) {
  let max = 0;
  for (const c of existing) {
    const m = String(c || '').toUpperCase().match(/^C(\d{1,6})$/);
    if (m?.[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `C${String(max + 1).padStart(3, '0')}`;
}

export default function ProdutoEditor({
  mode,
  produtoId,
}: {
  mode: 'create' | 'edit';
  produtoId?: string;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [loadingProduto, setLoadingProduto] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [form, setForm] = useState<ProdutoForm>({
    tipoCodigo: 'FORNECEDOR',
    code: '',
    descricao: '',

    pesoKg: '',
    comprimentoCm: '',
    larguraCm: '',
    alturaCm: '',

    embalado: false,
    tipoEmbalagem: '',
    fragil: false,
    empilhavel: true,
    posicao: 'INDIFERENTE',
    desmontavel: false,

    componentes: [],
  });

  async function loadProduto(id: string) {
    const pid = (id || '').trim();
    if (!pid) return;

    try {
      setLoadingProduto(true);
      setErr(null);

      const res = await fetch(`/api/produtos/${encodeURIComponent(pid)}`, { cache: 'no-store' });
      const j = await safeJson(res);

      if (!res.ok || !j?.ok || !j?.produto) throw new Error(j?.error || 'Falha ao carregar produto');

      const p = j.produto;

      setForm({
        tipoCodigo: (p.tipoCodigo || 'FORNECEDOR') as TipoCodigo,
        code: String(p.code || ''),
        descricao: String(p.descricao || ''),

        pesoKg: p.pesoKg ?? '',
        comprimentoCm: p.comprimentoCm ?? '',
        larguraCm: p.larguraCm ?? '',
        alturaCm: p.alturaCm ?? '',

        embalado: !!p.embalado,
        tipoEmbalagem: p.tipoEmbalagem ?? '',
        fragil: !!p.fragil,
        empilhavel: p.empilhavel === false ? false : true,
        posicao: p.posicao ?? 'INDIFERENTE',
        desmontavel: !!p.desmontavel,

        componentes: Array.isArray(p.componentes)
          ? p.componentes.map((c: any) => ({
              codigo: String(c.codigo || ''),
              nome: String(c.nome || ''),
              pesoKg: c.pesoKg ?? '',
              comprimentoCm: c.comprimentoCm ?? '',
              larguraCm: c.larguraCm ?? '',
              alturaCm: c.alturaCm ?? '',
              quantidade: c.quantidade ?? '1',
              observacao: c.observacao ?? '',
            }))
          : [],
      });
    } catch (e: any) {
      setErr(e?.message || 'Falha ao carregar');
    } finally {
      setLoadingProduto(false);
    }
  }

  useEffect(() => {
    if (mode === 'edit' && produtoId) void loadProduto(produtoId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, produtoId]);

  const areaM2 = useMemo(() => fmtCalcAreaM2(form.larguraCm, form.comprimentoCm), [form.larguraCm, form.comprimentoCm]);
  const volM3 = useMemo(() => fmtCalcVolM3(form.alturaCm, form.larguraCm, form.comprimentoCm), [form.alturaCm, form.larguraCm, form.comprimentoCm]);

  function set<K extends keyof ProdutoForm>(k: K, v: ProdutoForm[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function addComponente() {
    const codes = form.componentes.map((c) => c.codigo).filter(Boolean);
    const codigo = nextCompCode(codes);
    setForm((f) => ({
      ...f,
      componentes: [
        ...f.componentes,
        {
          codigo,
          nome: '',
          pesoKg: '',
          comprimentoCm: '',
          larguraCm: '',
          alturaCm: '',
          quantidade: '1',
          observacao: '',
        },
      ],
    }));
  }

  function removeComponente(idx: number) {
    setForm((f) => ({ ...f, componentes: f.componentes.filter((_, i) => i !== idx) }));
  }

  function updateComp(idx: number, patch: Partial<ComponenteForm>) {
    setForm((f) => ({
      ...f,
      componentes: f.componentes.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  }

  async function save() {
    setErr(null);
    setOkMsg(null);

    if (!form.descricao.trim()) {
      setErr('Descrição é obrigatória.');
      return;
    }

    if (form.tipoCodigo === 'FORNECEDOR' && !form.code.trim()) {
      setErr('Código é obrigatório para tipo FORNECEDOR.');
      return;
    }

    // valida componentes: se tiver nome, precisa ter código
    for (const c of form.componentes) {
      const nome = c.nome.trim();
      if (!nome) continue;
      if (!c.codigo.trim()) {
        setErr('Componente com descrição precisa ter "codigo".');
        return;
      }
    }

    const payload = {
      tipoCodigo: form.tipoCodigo,
      code: form.code.trim() || null,
      descricao: form.descricao.trim(),

      pesoKg: form.pesoKg,
      comprimentoCm: form.comprimentoCm,
      larguraCm: form.larguraCm,
      alturaCm: form.alturaCm,

      embalado: form.embalado,
      tipoEmbalagem: form.tipoEmbalagem.trim() || null,
      fragil: form.fragil,
      empilhavel: form.empilhavel,
      posicao: form.posicao.trim() || null,
      desmontavel: form.desmontavel,

      componentes: form.componentes
        .map((c) => ({
          codigo: c.codigo.trim(),
          nome: c.nome.trim(),
          pesoKg: c.pesoKg,
          comprimentoCm: c.comprimentoCm,
          larguraCm: c.larguraCm,
          alturaCm: c.alturaCm,
          quantidade: c.quantidade,
          observacao: c.observacao,
        }))
        .filter((c) => c.codigo || c.nome),
    };

    try {
      setLoading(true);

      let res: Response;
      if (mode === 'create') {
        res = await fetch('/api/produtos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        res = await fetch(`/api/produtos/${encodeURIComponent(produtoId || '')}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }

      const j = await safeJson(res);

      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || 'Falha ao salvar');
      }

      setOkMsg('OK: produto salvo.');
      if (mode === 'create' && j?.produto?.id) {
        router.replace(`/produtos/${encodeURIComponent(j.produto.id)}`);
      } else if (mode === 'edit' && produtoId) {
        void loadProduto(produtoId);
      }
    } catch (e: any) {
      setErr(e?.message || 'Falha ao salvar');
    } finally {
      setLoading(false);
    }
  }

  async function del() {
    if (mode !== 'edit' || !produtoId) return;
    const ok = confirm('Excluir este produto? (irá remover componentes junto)');
    if (!ok) return;

    try {
      setLoading(true);
      setErr(null);

      const res = await fetch(`/api/produtos/${encodeURIComponent(produtoId)}`, { method: 'DELETE' });
      const j = await safeJson(res);

      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Falha ao excluir');

      router.replace('/produtos');
    } catch (e: any) {
      setErr(e?.message || 'Falha ao excluir');
    } finally {
      setLoading(false);
    }
  }

  const page: React.CSSProperties = {
    padding: 16,
    minHeight: '100vh',
    background: '#ffffff',
    color: '#1e293b',
  };

  const card: React.CSSProperties = {
    marginTop: 12,
    padding: 14,
    borderRadius: 10,
    border: '1px solid #e2e8f0',
    background: '#f8fafc',
  };

  const btn: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 900,
  };

  const miniBtn: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 900,
  };

  return (
    <div style={page}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>
            {mode === 'create' ? 'Novo Produto' : 'Editar Produto'}
          </h1>
          <div style={{ color: '#1A4A1A', fontSize: 12, marginTop: 4 }}>
            {mode === 'edit' ? (produtoId || '') : 'Cadastro de Produtos e Componentes'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Link
            href="/produtos"
            style={{
              ...btn,
              background: '#1A4A1A',
              color: '#fff',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Voltar
          </Link>

          {mode === 'edit' && (
            <button onClick={del} disabled={loading} style={{ ...btn, background: '#ef4444', color: '#fff', opacity: loading ? 0.6 : 1 }}>
              Excluir
            </button>
          )}

          <button onClick={save} disabled={loading || loadingProduto} style={{ ...btn, background: '#22c55e', color: '#fff', opacity: loading || loadingProduto ? 0.6 : 1 }}>
            {loading ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      {(err || okMsg) && (
        <div style={{ ...card, marginTop: 10, color: err ? '#fca5a5' : '#86efac', fontWeight: 900 }}>
          {err || okMsg}
        </div>
      )}

      {loadingProduto ? (
        <div style={{ ...card, marginTop: 12, opacity: 0.85 }}>Carregando produto…</div>
      ) : (
        <>
          <div style={card}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Dados do Produto</h2>

            <div style={{ marginTop: 12, display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Tipo de código</div>
                <select
                  value={form.tipoCodigo}
                  onChange={(e) => set('tipoCodigo', (e.target.value as TipoCodigo) || 'FORNECEDOR')}
                  style={{
                    width: '100%',
                    padding: 10,
                    borderRadius: 10,
                    border: '1px solid #d1d5db',
                    background: '#ffffff',
                    color: '#1e293b',
                    fontWeight: 900,
                  }}
                >
                  <option value="FORNECEDOR">FORNECEDOR</option>
                  <option value="INTERNO">INTERNO (gera automático se vazio)</option>
                </select>
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Código</div>
                <input
                  value={form.code}
                  onChange={(e) => set('code', e.target.value)}
                  placeholder={form.tipoCodigo === 'INTERNO' ? '(deixe vazio para auto INT-000001...)' : 'ex: CRSG 20'}
                  style={{
                    width: '100%',
                    padding: 10,
                    borderRadius: 10,
                    border: '1px solid #d1d5db',
                    background: '#ffffff',
                    color: '#1e293b',
                    fontWeight: 900,
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Descrição</div>
                <input
                  value={form.descricao}
                  onChange={(e) => set('descricao', e.target.value)}
                  placeholder="Descrição do item…"
                  style={{
                    width: '100%',
                    padding: 10,
                    borderRadius: 10,
                    border: '1px solid #d1d5db',
                    background: '#ffffff',
                    color: '#1e293b',
                    fontWeight: 900,
                  }}
                />
              </div>
            </div>
          </div>

          <div style={card}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Medidas / Peso</h2>

            <div style={{ marginTop: 12, display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Peso (kg)</div>
                <input value={form.pesoKg} onChange={(e) => set('pesoKg', e.target.value)} placeholder="ex: 120.5" style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #d1d5db', background: '#ffffff', color: '#1e293b', fontWeight: 900 }} />
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Comprimento (cm)</div>
                <input value={form.comprimentoCm} onChange={(e) => set('comprimentoCm', e.target.value)} placeholder="ex: 200" style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #d1d5db', background: '#ffffff', color: '#1e293b', fontWeight: 900 }} />
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Largura (cm)</div>
                <input value={form.larguraCm} onChange={(e) => set('larguraCm', e.target.value)} placeholder="ex: 80" style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #d1d5db', background: '#ffffff', color: '#1e293b', fontWeight: 900 }} />
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Altura (cm)</div>
                <input value={form.alturaCm} onChange={(e) => set('alturaCm', e.target.value)} placeholder="ex: 70" style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #d1d5db', background: '#ffffff', color: '#1e293b', fontWeight: 900 }} />
              </div>
            </div>

            <div style={{ marginTop: 10, display: 'flex', gap: 18, flexWrap: 'wrap', fontWeight: 900 }}>
              <div>M² (auto): <span style={{ color: '#1A4A1A' }}>{areaM2}</span></div>
              <div>M³ (auto): <span style={{ color: '#1A4A1A' }}>{volM3}</span></div>
            </div>
          </div>

          <div style={card}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Parametrizações</h2>

            <div style={{ marginTop: 12, display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr 1fr' }}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 900 }}>
                <input type="checkbox" checked={form.embalado} onChange={(e) => set('embalado', e.target.checked)} />
                Embalado
              </label>

              <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 900 }}>
                <input type="checkbox" checked={form.fragil} onChange={(e) => set('fragil', e.target.checked)} />
                Frágil
              </label>

              <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 900 }}>
                <input type="checkbox" checked={form.empilhavel} onChange={(e) => set('empilhavel', e.target.checked)} />
                Empilhável
              </label>

              <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 900 }}>
                <input type="checkbox" checked={form.desmontavel} onChange={(e) => set('desmontavel', e.target.checked)} />
                Desmontável (tem componentes)
              </label>

              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Tipo de embalagem</div>
                <select
                  value={form.tipoEmbalagem}
                  onChange={(e) => set('tipoEmbalagem', e.target.value)}
                  style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #d1d5db', background: '#ffffff', color: '#1e293b', fontWeight: 900 }}
                >
                  <option value="">(não informado)</option>
                  <option value="CAIXA_MADEIRA">caixa de madeira</option>
                  <option value="CAIXA_PAPELAO">caixa de papelão</option>
                  <option value="AMARRADO">amarrado</option>
                  <option value="OUTROS">outros</option>
                </select>
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Posição</div>
                <select
                  value={form.posicao}
                  onChange={(e) => set('posicao', e.target.value)}
                  style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #d1d5db', background: '#ffffff', color: '#1e293b', fontWeight: 900 }}
                >
                  <option value="FRONTAL">frontal</option>
                  <option value="INDIFERENTE">indiferente</option>
                </select>
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Componentes</h2>

              <button
                onClick={addComponente}
                style={{ ...btn, background: '#F5BE16', color: '#1A4A1A' }}
                title="Cria um componente (antes de salvar)"
              >
                Criar componente
              </button>
            </div>

            {form.componentes.length === 0 ? (
              <div style={{ marginTop: 10, opacity: 0.8 }}>(Sem componentes)</div>
            ) : (
              <div style={{ marginTop: 10, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Código</th>
                      <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Descrição</th>
                      <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Qtd</th>
                      <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Peso</th>
                      <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>C</th>
                      <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>L</th>
                      <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>A</th>
                      <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>M²</th>
                      <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>M³</th>
                      <th style={{ textAlign: 'left', padding: 10, fontSize: 12, opacity: 0.9 }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.componentes.map((c, idx) => (
                      <tr key={`${c.codigo}-${idx}`} style={{ borderTop: '1px solid #e2e8f0' }}>
                        <td style={{ padding: 10 }}>
                          <input value={c.codigo} onChange={(e) => updateComp(idx, { codigo: e.target.value })} style={{ width: 110, padding: 8, borderRadius: 10, border: '1px solid #d1d5db', background: '#ffffff', color: '#1e293b', fontWeight: 900 }} />
                        </td>
                        <td style={{ padding: 10 }}>
                          <input value={c.nome} onChange={(e) => updateComp(idx, { nome: e.target.value })} style={{ width: 280, padding: 8, borderRadius: 10, border: '1px solid #d1d5db', background: '#ffffff', color: '#1e293b', fontWeight: 900 }} />
                        </td>
                        <td style={{ padding: 10 }}>
                          <input value={c.quantidade} onChange={(e) => updateComp(idx, { quantidade: e.target.value })} style={{ width: 70, padding: 8, borderRadius: 10, border: '1px solid #d1d5db', background: '#ffffff', color: '#1e293b', fontWeight: 900 }} />
                        </td>
                        <td style={{ padding: 10 }}>
                          <input value={c.pesoKg} onChange={(e) => updateComp(idx, { pesoKg: e.target.value })} style={{ width: 80, padding: 8, borderRadius: 10, border: '1px solid #d1d5db', background: '#ffffff', color: '#1e293b', fontWeight: 900 }} />
                        </td>
                        <td style={{ padding: 10 }}>
                          <input value={c.comprimentoCm} onChange={(e) => updateComp(idx, { comprimentoCm: e.target.value })} style={{ width: 70, padding: 8, borderRadius: 10, border: '1px solid #d1d5db', background: '#ffffff', color: '#1e293b', fontWeight: 900 }} />
                        </td>
                        <td style={{ padding: 10 }}>
                          <input value={c.larguraCm} onChange={(e) => updateComp(idx, { larguraCm: e.target.value })} style={{ width: 70, padding: 8, borderRadius: 10, border: '1px solid #d1d5db', background: '#ffffff', color: '#1e293b', fontWeight: 900 }} />
                        </td>
                        <td style={{ padding: 10 }}>
                          <input value={c.alturaCm} onChange={(e) => updateComp(idx, { alturaCm: e.target.value })} style={{ width: 70, padding: 8, borderRadius: 10, border: '1px solid #d1d5db', background: '#ffffff', color: '#1e293b', fontWeight: 900 }} />
                        </td>
                        <td style={{ padding: 10, fontWeight: 900, color: '#1A4A1A' }}>
                          {fmtCalcAreaM2(c.larguraCm, c.comprimentoCm)}
                        </td>
                        <td style={{ padding: 10, fontWeight: 900, color: '#1A4A1A' }}>
                          {fmtCalcVolM3(c.alturaCm, c.larguraCm, c.comprimentoCm)}
                        </td>
                        <td style={{ padding: 10 }}>
                          <button onClick={() => removeComponente(idx)} style={{ ...miniBtn, background: '#ef4444', color: '#fff' }}>
                            remover
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ marginTop: 10, opacity: 0.8, fontSize: 12 }}>
                  Observação: campos M²/M³ são calculados automaticamente no backend ao salvar.
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
