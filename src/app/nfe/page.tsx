'use client';
import { useState, useRef } from 'react';
import Link from 'next/link';

// ── Tipos ───────────────────────────────────────────────────────────────────

type Step = 'input' | 'loading' | 'preview' | 'confirming' | 'success';

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
  const [step, setStep]           = useState<Step>('input');
  const [chave, setChave]         = useState('');
  const [data, setData]           = useState<PreviewPayload | null>(null);
  const [success, setSuccess]     = useState<SuccessPayload | null>(null);
  const [error, setError]         = useState('');
  const inputRef                  = useRef<HTMLInputElement>(null);

  const digits = chave.replace(/\D/g, '');
  const isValid = digits.length === 44;

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setChave(formatChaveDisplay(e.target.value));
    setError('');
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    setChave(formatChaveDisplay(pasted));
    setError('');
  }

  async function handleConsultar() {
    if (!isValid) { setError('A chave deve ter exatamente 44 dígitos.'); return; }
    setStep('loading');
    setError('');
    try {
      const res  = await fetch('/api/nfe/consultar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chave: digits }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro ao consultar.');
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
          Cole a chave de acesso (44 dígitos) para cadastrar a coleta automaticamente.
        </p>
      </div>

      {/* ── STEP: INPUT ───────────────────────────────────────────────────── */}
      {(step === 'input' || step === 'loading') && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
          <div style={{ marginBottom: 6, fontWeight: 600, color: '#374151', fontSize: 14 }}>
            Chave de Acesso
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

          {/* Contador de dígitos */}
          <div style={{ marginTop: 6, fontSize: 12, color: digits.length === 44 ? '#16a34a' : '#9ca3af', textAlign: 'right' }}>
            {digits.length}/44 dígitos {digits.length === 44 && '✓'}
          </div>

          {error && (
            <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}

          <button
            onClick={handleConsultar}
            disabled={!isValid || step === 'loading'}
            style={{
              marginTop: 20, width: '100%', padding: '12px',
              background: isValid && step !== 'loading' ? 'linear-gradient(135deg, #1A4A1A, #2d6a2d)' : '#d1d5db',
              color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 15, fontWeight: 700, cursor: isValid && step !== 'loading' ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all .15s',
            }}
          >
            {step === 'loading' ? (
              <>
                <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                Consultando NF-e...
              </>
            ) : (
              <>🔍 Consultar NF-e</>
            )}
          </button>

          {/* Dica */}
          <div style={{ marginTop: 20, padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
            <div style={{ fontWeight: 600, color: '#166534', fontSize: 13, marginBottom: 4 }}>
              💡 Onde encontro a chave de acesso?
            </div>
            <ul style={{ margin: 0, padding: '0 0 0 18px', color: '#374151', fontSize: 13, lineHeight: 1.7 }}>
              <li>No DANFE impresso (linha de código de barras ou texto acima do código)</li>
              <li>No XML da NF-e (campo <code style={{ fontSize: 12 }}>chNFe</code>)</li>
              <li>Nos sites <strong>consultadanfe.com</strong> ou <strong>meudanfe.com.br</strong> após o scan</li>
            </ul>
          </div>

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
                Quando um provedor real for configurado, essa nota retornará os dados reais da NF-e.
              </span>
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

            {/* Resumo do que será criado */}
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
                  { label: 'Cliente', value: data.preview.clienteExistente ? `Existente (${data.preview.clienteExistente.razao.slice(0, 20)}...)` : '1 novo' },
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

            {/* Erro de confirmação */}
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
