'use client';
import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';

// ── Tipos ───────────────────────────────────────────────────────────────────

type Step = 'input' | 'loading' | 'preview' | 'confirming' | 'success';
type Tab  = 'chave' | 'pdf';

interface ItemPreview {
  nItem: number;
  cProd: string;
  xProd: string;
  qCom: number;
  uCom: string;
  vProd: number;
  pesoLiq?: number;
  produtoExistente: { id: string; code: string; descricao: string; matchType: string } | null;
}

interface PreviewPayload {
  nfe: {
    chave: string;
    nNF: string;
    serie: string;
    dhEmi: string;
    isMock: boolean;
    fonte?: string;
    emitente: { cnpj: string; razaoSocial: string; cidade: string; uf: string };
    destinatario?: { razaoSocial?: string; cidade: string; uf: string };
    vNF: number;
    pesoTotal?: number;
    itens: ItemPreview[];
  };
  preview: {
    clienteExistente: { id: string; razao: string } | null;
    coletaExistente: { id: string; nf: string } | null;
    novosClientes: number;
    novosProdutos: number;
    totalItens: number;
  };
}

interface SuccessPayload {
  coletaId: string;
  nNF: string;
  produtosCriados: number;
  itensCriados: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatChaveDisplay(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 44);
  return digits.match(/.{1,4}/g)?.join(' ') ?? digits;
}

function fmtCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

// ── Componentes auxiliares ──────────────────────────────────────────────────

function Badge({ color, children }: { color: 'green' | 'blue' | 'yellow' | 'gray' | 'red'; children: React.ReactNode }) {
  const colors = {
    green:  { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
    blue:   { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' },
    yellow: { bg: '#fef9c3', color: '#854d0e', border: '#fde047' },
    gray:   { bg: '#f3f4f6', color: '#374151', border: '#d1d5db' },
    red:    { bg: '#fee2e2', color: '#991b1b', border: '#fecaca' },
  }[color];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 999,
      fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
      background: colors.bg, color: colors.color, border: `1px solid ${colors.border}`,
    }}>
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Página principal ────────────────────────────────────────────────────────

export default function ImportarNFePage() {
  const [step, setStep]         = useState<Step>('input');
  const [tab, setTab]           = useState<Tab>('pdf');
  const [chave, setChave]       = useState('');
  const [pdfFile, setPdfFile]   = useState<File | null>(null);
  const [isDragging, setDragging] = useState(false);
  const [data, setData]         = useState<PreviewPayload | null>(null);
  const [success, setSuccess]   = useState<SuccessPayload | null>(null);
  const [error, setError]       = useState('');
  const inputRef                = useRef<HTMLInputElement>(null);
  const fileInputRef            = useRef<HTMLInputElement>(null);

  const digits   = chave.replace(/\D/g, '');
  const isValid  = digits.length === 44;
  const canSubmit = tab === 'chave' ? isValid : !!pdfFile;

  // ── Handlers: chave ─────────────────────────────────────────────────────

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setChave(formatChaveDisplay(e.target.value));
    setError('');
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    setChave(formatChaveDisplay(e.clipboardData.getData('text')));
    setError('');
  }

  // ── Handlers: PDF drag & drop ────────────────────────────────────────────

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.toLowerCase().endsWith('.pdf')) {
      setPdfFile(f);
      setError('');
    } else {
      setError('Apenas arquivos PDF são aceitos.');
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setPdfFile(f); setError(''); }
  };

  // ── Handler principal: consultar / processar ─────────────────────────────

  async function handleConsultar() {
    if (!canSubmit) return;
    setStep('loading');
    setError('');

    try {
      let json: any;

      if (tab === 'chave') {
        // Consulta por chave (mock ou API real)
        if (!isValid) throw new Error('A chave deve ter exatamente 44 dígitos.');
        const res = await fetch('/api/nfe/consultar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chave: digits }),
        });
        json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Erro ao consultar.');
      } else {
        // Upload de PDF
        if (!pdfFile) throw new Error('Selecione um arquivo PDF.');
        const fd = new FormData();
        fd.append('file', pdfFile);
        const res = await fetch('/api/nfe/pdf', { method: 'POST', body: fd });
        json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Erro ao processar PDF.');
      }

      setData(json);
      setStep('preview');
    } catch (e: any) {
      setError(e.message);
      setStep('input');
    }
  }

  async function handleConfirmar() {
    if (!data) return;
    setStep('confirming');
    setError('');
    try {
      const clienteIdOverride = data.preview.clienteExistente?.id ?? undefined;
      const res  = await fetch('/api/nfe/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nfe: data.nfe, clienteIdOverride }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro ao importar.');
      setSuccess(json);
      setStep('success');
    } catch (e: any) {
      setError(e.message);
      setStep('preview');
    }
  }

  function handleNova() {
    setChave('');
    setPdfFile(null);
    setData(null);
    setSuccess(null);
    setError('');
    setStep('input');
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#111827', display: 'flex', alignItems: 'center', gap: 10 }}>
          📄 Importar Nota Fiscal Eletrônica
        </h1>
        <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 14 }}>
          Importe o DANFE em PDF ou cole a chave de acesso para cadastrar a coleta automaticamente.
        </p>
      </div>

      {/* ── STEP: INPUT ───────────────────────────────────────────────────── */}
      {(step === 'input' || step === 'loading') && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 28, borderBottom: '2px solid #e5e7eb' }}>
            {([
              { key: 'pdf',   label: '📎 Upload PDF',       hint: 'Recomendado' },
              { key: 'chave', label: '🔢 Chave de acesso',  hint: ''  },
            ] as { key: Tab; label: string; hint: string }[]).map((t) => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setError(''); }}
                style={{
                  padding: '10px 20px', background: 'none', border: 'none',
                  borderBottom: tab === t.key ? '2px solid #1A4A1A' : '2px solid transparent',
                  marginBottom: -2,
                  color: tab === t.key ? '#1A4A1A' : '#6b7280',
                  fontWeight: tab === t.key ? 700 : 500,
                  fontSize: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all .15s',
                }}
              >
                {t.label}
                {t.hint && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', background: '#dcfce7', color: '#166534', borderRadius: 999 }}>
                    {t.hint}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Tab: Upload PDF ─────────────────────────────────────────── */}
          {tab === 'pdf' && (
            <>
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? '#1A4A1A' : pdfFile ? '#86efac' : '#d1d5db'}`,
                  borderRadius: 10,
                  padding: '36px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: isDragging ? '#f0fdf4' : pdfFile ? '#f0fdf4' : '#fafafa',
                  transition: 'all .15s',
                  marginBottom: 16,
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  style={{ display: 'none' }}
                  onChange={handleFileInput}
                />

                {pdfFile ? (
                  <>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
                    <div style={{ fontWeight: 700, color: '#166534', fontSize: 15 }}>{pdfFile.name}</div>
                    <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
                      {(pdfFile.size / 1024).toFixed(0)} KB &nbsp;·&nbsp;
                      <span style={{ color: '#1A4A1A', textDecoration: 'underline' }}>Trocar arquivo</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>📎</div>
                    <div style={{ fontWeight: 600, color: '#374151', fontSize: 15 }}>
                      Arraste o DANFE (PDF) aqui
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>
                      ou <span style={{ color: '#1A4A1A', textDecoration: 'underline' }}>clique para selecionar</span>
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 8 }}>
                      Aceita o PDF do DANFE enviado pelo cliente
                    </div>
                  </>
                )}
              </div>

              {/* Dica */}
              <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, color: '#374151', marginBottom: 20 }}>
                💡 <strong>Como usar:</strong> Abra o PDF da NF que o cliente enviou e arraste aqui. O sistema extrai todos os dados automaticamente — cliente, produtos, valores e peso.
              </div>
            </>
          )}

          {/* ── Tab: Chave de acesso ─────────────────────────────────── */}
          {tab === 'chave' && (
            <>
              <div style={{ marginBottom: 6, fontWeight: 600, color: '#374151', fontSize: 14 }}>
                Chave de Acesso (44 dígitos)
              </div>
              <input
                ref={inputRef}
                value={chave}
                onChange={handleChange}
                onPaste={handlePaste}
                placeholder="3524 0312 3456 7800 0195 5500 1000 0001 2340 0001 2345"
                disabled={step === 'loading'}
                onKeyDown={(e) => e.key === 'Enter' && handleConsultar()}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '12px 16px', borderRadius: 8,
                  border: `2px solid ${error ? '#fca5a5' : isValid ? '#86efac' : '#d1d5db'}`,
                  fontSize: 14, fontFamily: 'monospace', letterSpacing: 1,
                  color: '#111827', background: step === 'loading' ? '#f9fafb' : '#fff',
                  outline: 'none', transition: 'border-color .15s',
                }}
              />
              <div style={{ marginTop: 6, fontSize: 12, color: digits.length === 44 ? '#16a34a' : '#9ca3af', textAlign: 'right' }}>
                {digits.length}/44 dígitos {digits.length === 44 && '✓'}
              </div>

              {/* Dica */}
              <div style={{ marginTop: 14, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, color: '#374151', marginBottom: 6 }}>
                💡 A chave fica impressa no DANFE (linha longa de números abaixo do código de barras). <strong>Atenção:</strong> sem API configurada os dados dos itens são simulados — prefira usar o Upload PDF.
              </div>
            </>
          )}

          {/* Erro */}
          {error && (
            <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}

          {/* Botão */}
          <button
            onClick={handleConsultar}
            disabled={!canSubmit || step === 'loading'}
            style={{
              width: '100%', padding: '13px',
              background: canSubmit && step !== 'loading' ? 'linear-gradient(135deg, #1A4A1A, #2d6a2d)' : '#d1d5db',
              color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 15, fontWeight: 700,
              cursor: canSubmit && step !== 'loading' ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all .15s',
            }}
          >
            {step === 'loading' ? (
              <>
                <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                {tab === 'pdf' ? 'Lendo PDF...' : 'Consultando NF-e...'}
              </>
            ) : (
              tab === 'pdf' ? '📄 Importar PDF' : '🔍 Consultar NF-e'
            )}
          </button>

          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── STEP: PREVIEW ─────────────────────────────────────────────────── */}
      {step === 'preview' && data && (
        <div>
          {/* Banner mock */}
          {data.nfe.isMock && (
            <div style={{
              marginBottom: 16, padding: '10px 16px',
              background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
              color: '#92400e', fontSize: 13, fontWeight: 500,
              display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span>
                <strong>Modo demonstração</strong> — os dados dos itens são simulados.
                Use o <strong>Upload PDF</strong> para importar os dados reais da nota.
              </span>
            </div>
          )}

          {/* Banner PDF real */}
          {data.nfe.fonte === 'pdf' && (
            <div style={{
              marginBottom: 16, padding: '10px 16px',
              background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8,
              color: '#166534', fontSize: 13, fontWeight: 500,
              display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: 16 }}>✅</span>
              <span><strong>Dados lidos do DANFE</strong> — informações extraídas diretamente do PDF da nota fiscal.</span>
            </div>
          )}

          {/* Alerta NF duplicada */}
          {data.preview.coletaExistente && (
            <div style={{
              marginBottom: 16, padding: '12px 16px',
              background: '#fef2f2', border: '2px solid #fca5a5', borderRadius: 8,
              color: '#dc2626', fontSize: 14, fontWeight: 600,
            }}>
              🚫 Esta NF-e ({data.nfe.nNF}) já foi importada anteriormente.
              <Link href={`/coletas`} style={{ marginLeft: 8, color: '#dc2626', textDecoration: 'underline' }}>
                Ver coletas
              </Link>
            </div>
          )}

          {/* Card principal */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 28, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>

            {/* Cabeçalho NF */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid #f3f4f6' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>
                  NF-e nº {data.nfe.nNF}
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                  Série {data.nfe.serie} &nbsp;·&nbsp; Emissão: {fmtDate(data.nfe.dhEmi)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1A4A1A' }}>
                  {fmtCurrency(data.nfe.vNF)}
                </div>
                {data.nfe.pesoTotal && (
                  <div style={{ fontSize: 12, color: '#6b7280' }}>⚖️ {data.nfe.pesoTotal} kg</div>
                )}
              </div>
            </div>

            {/* Emitente */}
            <Section title="🏢 Emitente (cliente)">
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#111827', fontSize: 15 }}>
                      {data.nfe.emitente.razaoSocial}
                    </div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                      CNPJ: {data.nfe.emitente.cnpj} &nbsp;·&nbsp; {data.nfe.emitente.cidade}/{data.nfe.emitente.uf}
                    </div>
                  </div>
                  {data.preview.clienteExistente
                    ? <Badge color="green">✓ Já cadastrado: {data.preview.clienteExistente.razao}</Badge>
                    : <Badge color="blue">🆕 Novo cliente</Badge>
                  }
                </div>
              </div>
            </Section>

            {/* Destinatário */}
            {data.nfe.destinatario && (
              <Section title="📍 Destino">
                <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 16px', fontSize: 14, color: '#374151' }}>
                  {data.nfe.destinatario.razaoSocial && <strong>{data.nfe.destinatario.razaoSocial} — </strong>}
                  {data.nfe.destinatario.cidade}/{data.nfe.destinatario.uf}
                </div>
              </Section>
            )}

            {/* Itens */}
            <Section title={`📦 Itens (${data.nfe.itens.length} produto${data.nfe.itens.length !== 1 ? 's' : ''})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.nfe.itens.map((item) => (
                  <div key={item.nItem} style={{
                    background: item.produtoExistente ? '#f0fdf4' : '#eff6ff',
                    border: `1px solid ${item.produtoExistente ? '#bbf7d0' : '#bfdbfe'}`,
                    borderRadius: 8, padding: '12px 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
                  }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 600, color: '#111827', fontSize: 14 }}>
                        {item.qCom} × {item.xProd}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                        Cód: {item.cProd}
                        {item.pesoLiq ? ` · ${item.pesoLiq} kg` : ''}
                        &nbsp;·&nbsp; {fmtCurrency(item.vProd)}
                      </div>
                    </div>
                    <div>
                      {item.produtoExistente ? (
                        <Badge color="green">
                          ✓ {item.produtoExistente.code}
                          <span style={{ opacity: .7 }}> ({item.produtoExistente.matchType})</span>
                        </Badge>
                      ) : (
                        <Badge color="blue">🆕 Produto novo</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Resumo */}
            <div style={{
              background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8,
              padding: '14px 18px', marginBottom: 24,
            }}>
              <div style={{ fontWeight: 700, color: '#166534', fontSize: 13, marginBottom: 8 }}>
                📋 Resumo da importação
              </div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {[
                  { label: 'Coleta', value: '1 nova', warn: !!data.preview.coletaExistente },
                  { label: 'Cliente', value: data.preview.clienteExistente ? `Existente` : '1 novo' },
                  { label: 'Produtos novos', value: String(data.preview.novosProdutos) },
                  { label: 'Itens criados', value: String(data.preview.totalItens) },
                ].map((r) => (
                  <div key={r.label} style={{ minWidth: 110 }}>
                    <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{r.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: r.warn ? '#dc2626' : '#1A4A1A' }}>{r.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Erro */}
            {error && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>
                ⚠️ {error}
              </div>
            )}

            {/* Botões */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={handleNova}
                style={{
                  flex: 1, padding: '11px', background: '#fff',
                  border: '2px solid #d1d5db', borderRadius: 8,
                  fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer',
                }}
              >
                ← Cancelar
              </button>
              <button
                onClick={handleConfirmar}
                disabled={!!data.preview.coletaExistente}
                style={{
                  flex: 2, padding: '11px',
                  background: data.preview.coletaExistente ? '#d1d5db' : 'linear-gradient(135deg, #1A4A1A, #2d6a2d)',
                  color: '#fff', border: 'none', borderRadius: 8,
                  fontSize: 15, fontWeight: 700,
                  cursor: data.preview.coletaExistente ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                ✓ Confirmar Importação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP: CONFIRMANDO ─────────────────────────────────────────────── */}
      {step === 'confirming' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 48, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Importando NF-e...</div>
          <div style={{ color: '#6b7280', fontSize: 14 }}>Criando coleta, produtos e itens no banco de dados.</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── STEP: SUCESSO ─────────────────────────────────────────────────── */}
      {step === 'success' && success && (
        <div style={{ background: '#fff', border: '2px solid #86efac', borderRadius: 12, padding: 40, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#166534', marginBottom: 8 }}>
            NF-e {success.nNF} importada!
          </div>
          <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 24, lineHeight: 1.7 }}>
            {success.itensCriados} {success.itensCriados === 1 ? 'item criado' : 'itens criados'}
            {success.produtosCriados > 0 && ` · ${success.produtosCriados} produto${success.produtosCriados !== 1 ? 's' : ''} novo${success.produtosCriados !== 1 ? 's' : ''} cadastrado${success.produtosCriados !== 1 ? 's' : ''}`}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              href={`/coletas`}
              style={{
                padding: '10px 24px', background: '#1A4A1A', color: '#fff',
                borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              📋 Ver Coletas
            </Link>
            <button
              onClick={handleNova}
              style={{
                padding: '10px 24px', background: '#fff', color: '#1A4A1A',
                border: '2px solid #1A4A1A', borderRadius: 8, fontWeight: 700, fontSize: 14,
                cursor: 'pointer',
              }}
            >
              + Importar outra NF-e
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
