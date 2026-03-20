'use client';

import React, { useEffect, useState } from 'react';

type Produto = {
  id: string;
  code: string;
  descricao: string;
};

type ResumoItem = {
  produtoId: string;
  code: string;
  descricao: string;
  quantidade: number;
  pesoProdutoKg: number;
  volumeProdutoM3: number;
  pesoComponentesKg: number;
  volumeComponentesM3: number;
  pesoTotalItemKg: number;
  volumeTotalItemM3: number;
};

type ResumoResponse = {
  itens: ResumoItem[];
  totais: {
    pesoTotalKg: number;
    volumeTotalM3: number;
  };
};

type ItemCarga = {
  produtoId: string;
  quantidade: number;
  produto?: Produto;
};

const bg = 'transparent';
const cardBg = '#ffffff';
const border = '#e2e8f0';

export default function SimuladorCargaPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loadingProdutos, setLoadingProdutos] = useState(false);
  const [erroProdutos, setErroProdutos] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [itensCarga, setItensCarga] = useState<ItemCarga[]>([]);
  const [resumo, setResumo] = useState<ResumoResponse | null>(null);
  const [loadingResumo, setLoadingResumo] = useState(false);
  const [erroResumo, setErroResumo] = useState<string | null>(null);

  // Carrega produtos para seleção
  useEffect(() => {
    void carregarProdutos();
  }, []);

  async function carregarProdutos(q?: string) {
    try {
      setLoadingProdutos(true);
      setErroProdutos(null);
      const params = new URLSearchParams();
      params.set('limit', '200');
      if (q && q.trim()) params.set('q', q.trim());

      const res = await fetch(`/api/produtos?${params.toString()}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao carregar produtos');

      // GET /api/produtos retorna um array de objetos com {id, code, descricao, ...}
      const lista: Produto[] = j.map((p: any) => ({
        id: p.id,
        code: p.code,
        descricao: p.descricao,
      }));

      setProdutos(lista);
    } catch (e: any) {
      setErroProdutos(e?.message || 'Falha ao carregar produtos');
    } finally {
      setLoadingProdutos(false);
    }
  }

  function adicionarAoCarrinho(p: Produto) {
    setItensCarga((atual) => {
      const idx = atual.findIndex((i) => i.produtoId === p.id);
      if (idx >= 0) {
        const copia = [...atual];
        copia[idx] = {
          ...copia[idx],
          quantidade: copia[idx].quantidade + 1,
        };
        return copia;
      }
      return [
        ...atual,
        {
          produtoId: p.id,
          quantidade: 1,
          produto: p,
        },
      ];
    });
  }

  function atualizarQuantidade(produtoId: string, quantidadeStr: string) {
    const n = Number(quantidadeStr);
    const qtd = Number.isFinite(n) && n > 0 ? n : 1;
    setItensCarga((atual) =>
      atual.map((item) =>
        item.produtoId === produtoId ? { ...item, quantidade: qtd } : item,
      ),
    );
  }

  function removerItem(produtoId: string) {
    setItensCarga((atual) => atual.filter((i) => i.produtoId !== produtoId));
  }

  async function calcularResumo() {
    try {
      setLoadingResumo(true);
      setErroResumo(null);
      setResumo(null);

      if (itensCarga.length === 0) {
        throw new Error('Adicione pelo menos um produto na carga.');
      }

      const payload = {
        items: itensCarga.map((i) => ({
          produtoId: i.produtoId,
          quantidade: i.quantidade,
        })),
      };

      const res = await fetch('/api/produtos/resumo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const j = await res.json();

      if (!res.ok) {
        throw new Error(j?.error || 'Falha ao calcular resumo da carga');
      }

      setResumo(j as ResumoResponse);
    } catch (e: any) {
      setErroResumo(e?.message || 'Falha ao calcular resumo da carga');
    } finally {
      setLoadingResumo(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: bg,
        color: '#1e293b',
        padding: 16,
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 12, color: '#1A4A1A' }}>
        Simulador de carga (peso / volume)
      </h1>

      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: '1.2fr 1.2fr 1fr',
        }}
      >
        {/* COLUNA 1: Lista de produtos */}
        <div
          style={{
            background: cardBg,
            border: `1px solid ${border}`,
            borderRadius: 12,
            padding: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8, color: '#1A4A1A' }}>
            Produtos
          </h2>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              placeholder="Buscar por código ou descrição"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{
                flex: 1,
                padding: 8,
                background: '#ffffff',
                border: `1px solid #d1d5db`,
                borderRadius: 6,
                color: '#1e293b',
              }}
            />
            <button
              onClick={() => carregarProdutos(busca)}
              disabled={loadingProdutos}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: '#2563eb',
                color: 'white',
                opacity: loadingProdutos ? 0.7 : 1,
              }}
            >
              {loadingProdutos ? 'Buscando…' : 'Buscar'}
            </button>
          </div>
          {erroProdutos && (
            <div style={{ color: '#dc2626', marginBottom: 8 }}>
              {erroProdutos}
            </div>
          )}
          <div
            style={{
              maxHeight: 360,
              overflowY: 'auto',
              borderRadius: 6,
              border: `1px solid ${border}`,
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                <tr
                  style={{
                    background: '#f8fafc',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '6px 8px',
                      borderBottom: `1px solid ${border}`,
                    }}
                  >
                    Código
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '6px 8px',
                      borderBottom: `1px solid ${border}`,
                    }}
                  >
                    Descrição
                  </th>
                  <th
                    style={{
                      textAlign: 'center',
                      padding: '6px 8px',
                      borderBottom: `1px solid ${border}`,
                    }}
                  >
                    Ação
                  </th>
                </tr>
              </thead>
              <tbody>
                {produtos.map((p) => (
                  <tr key={p.id}>
                    <td
                      style={{
                        padding: '6px 8px',
                        borderBottom: `1px solid ${border}`,
                      }}
                    >
                      {p.code}
                    </td>
                    <td
                      style={{
                        padding: '6px 8px',
                        borderBottom: `1px solid ${border}`,
                      }}
                    >
                      {p.descricao}
                    </td>
                    <td
                      style={{
                        padding: '6px 8px',
                        borderBottom: `1px solid ${border}`,
                        textAlign: 'center',
                      }}
                    >
                      <button
                        onClick={() => adicionarAoCarrinho(p)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: 'none',
                          cursor: 'pointer',
                          background: '#10b981',
                          color: 'white',
                          fontSize: 12,
                        }}
                      >
                        Adicionar
                      </button>
                    </td>
                  </tr>
                ))}
                {produtos.length === 0 && !loadingProdutos && (
                  <tr>
                    <td
                      colSpan={3}
                      style={{
                        padding: '8px',
                        textAlign: 'center',
                        color: '#64748b',
                      }}
                    >
                      Nenhum produto encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* COLUNA 2: Itens na carga */}
        <div
          style={{
            background: cardBg,
            border: `1px solid ${border}`,
            borderRadius: 12,
            padding: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8, color: '#1A4A1A' }}>
            Itens da carga
          </h2>
          <div
            style={{
              maxHeight: 420,
              overflowY: 'auto',
              borderRadius: 6,
              border: `1px solid ${border}`,
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '6px 8px',
                      borderBottom: `1px solid ${border}`,
                    }}
                  >
                    Produto
                  </th>
                  <th
                    style={{
                      textAlign: 'center',
                      padding: '6px 8px',
                      borderBottom: `1px solid ${border}`,
                    }}
                  >
                    Qtd
                  </th>
                  <th
                    style={{
                      textAlign: 'center',
                      padding: '6px 8px',
                      borderBottom: `1px solid ${border}`,
                    }}
                  >
                    Ação
                  </th>
                </tr>
              </thead>
              <tbody>
                {itensCarga.map((item) => (
                  <tr key={item.produtoId}>
                    <td
                      style={{
                        padding: '6px 8px',
                        borderBottom: `1px solid ${border}`,
                      }}
                    >
                      <div style={{ fontWeight: 500 }}>
                        {item.produto?.code || item.produtoId}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: '#64748b',
                          marginTop: 2,
                        }}
                      >
                        {item.produto?.descricao}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: '6px 8px',
                        borderBottom: `1px solid ${border}`,
                        textAlign: 'center',
                      }}
                    >
                      <input
                        type="number"
                        min={1}
                        value={item.quantidade}
                        onChange={(e) =>
                          atualizarQuantidade(item.produtoId, e.target.value)
                        }
                        style={{
                          width: 70,
                          padding: 4,
                          background: '#ffffff',
                          border: `1px solid #d1d5db`,
                          borderRadius: 6,
                          color: '#1e293b',
                          textAlign: 'center',
                        }}
                      />
                    </td>
                    <td
                      style={{
                        padding: '6px 8px',
                        borderBottom: `1px solid ${border}`,
                        textAlign: 'center',
                      }}
                    >
                      <button
                        onClick={() => removerItem(item.produtoId)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: 'none',
                          cursor: 'pointer',
                          background: '#ef4444',
                          color: 'white',
                          fontSize: 12,
                        }}
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
                {itensCarga.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      style={{
                        padding: '8px',
                        textAlign: 'center',
                        color: '#64748b',
                      }}
                    >
                      Nenhum item na carga.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button
              onClick={calcularResumo}
              disabled={loadingResumo || itensCarga.length === 0}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: '#10b981',
                color: 'white',
                opacity:
                  loadingResumo || itensCarga.length === 0 ? 0.7 : 1,
              }}
            >
              {loadingResumo ? 'Calculando…' : 'Calcular peso/volume'}
            </button>
            {erroResumo && (
              <div style={{ color: '#dc2626', fontSize: 13 }}>
                {erroResumo}
              </div>
            )}
          </div>
        </div>

        {/* COLUNA 3: Resumo */}
        <div
          style={{
            background: cardBg,
            border: `1px solid ${border}`,
            borderRadius: 12,
            padding: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8, color: '#1A4A1A' }}>
            Resumo da carga
          </h2>

          {!resumo && !loadingResumo && (
            <div style={{ fontSize: 13, color: '#64748b' }}>
              Monte a carga e clique em
              <br />
              <strong>&quot;Calcular peso/volume&quot;</strong> para ver os
              totais.
            </div>
          )}

          {loadingResumo && (
            <div style={{ fontSize: 13, color: '#64748b' }}>
              Calculando resumo…
            </div>
          )}

          {resumo && (
            <>
              <div
                style={{
                  padding: 8,
                  borderRadius: 6,
                  border: `1px solid ${border}`,
                  marginBottom: 12,
                  fontSize: 14,
                }}
              >
                <div style={{ marginBottom: 4 }}>
                  <strong>Peso total (kg):</strong>{' '}
                  {resumo.totais.pesoTotalKg.toFixed(2)}
                </div>
                <div>
                  <strong>Volume total (m³):</strong>{' '}
                  {resumo.totais.volumeTotalM3.toFixed(3)}
                </div>
              </div>

              <div
                style={{
                  maxHeight: 320,
                  overflowY: 'auto',
                  borderRadius: 6,
                  border: `1px solid ${border}`,
                  fontSize: 12,
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                  }}
                >
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: '6px 8px',
                          borderBottom: `1px solid ${border}`,
                        }}
                      >
                        Produto
                      </th>
                      <th
                        style={{
                          textAlign: 'right',
                          padding: '6px 8px',
                          borderBottom: `1px solid ${border}`,
                        }}
                      >
                        Qtd
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumo.itens.map((it) => (
                      <tr key={it.produtoId}>
                        <td
                          style={{
                            padding: '6px 8px',
                            borderBottom: `1px solid ${border}`,
                          }}
                        >
                          <div style={{ fontWeight: 500 }}>{it.code}</div>
                          <div
                            style={{
                              color: '#64748b',
                              fontSize: 11,
                              marginTop: 2,
                            }}
                          >
                            {it.descricao}
                          </div>
                          <div
                            style={{
                              marginTop: 4,
                              display: 'grid',
                              gap: 2,
                            }}
                          >
                            <span>
                              <strong>Peso unitário:</strong>{' '}
                              {it.pesoTotalItemKg / it.quantidade
                                ? (it.pesoTotalItemKg / it.quantidade).toFixed(
                                    2,
                                  )
                                : it.pesoTotalItemKg.toFixed(2)}{' '}
                              kg
                            </span>
                            <span>
                              <strong>Volume unitário:</strong>{' '}
                              {it.volumeTotalItemM3 / it.quantidade
                                ? (
                                    it.volumeTotalItemM3 / it.quantidade
                                  ).toFixed(3)
                                : it.volumeTotalItemM3.toFixed(3)}{' '}
                              m³
                            </span>
                            <span>
                              <strong>Peso componentes:</strong>{' '}
                              {it.pesoComponentesKg.toFixed(2)} kg
                            </span>
                            <span>
                              <strong>Volume componentes:</strong>{' '}
                              {it.volumeComponentesM3.toFixed(3)} m³
                            </span>
                          </div>
                        </td>
                        <td
                          style={{
                            padding: '6px 8px',
                            borderBottom: `1px solid ${border}`,
                            textAlign: 'right',
                            verticalAlign: 'top',
                          }}
                        >
                          {it.quantidade}
                          <br />
                          <span style={{ fontSize: 11, color: '#64748b' }}>
                            Peso total:{' '}
                            {it.pesoTotalItemKg.toFixed(2)} kg
                            <br />
                            Vol total:{' '}
                            {it.volumeTotalItemM3.toFixed(3)} m³
                          </span>
                        </td>
                      </tr>
                    ))}
                    {resumo.itens.length === 0 && (
                      <tr>
                        <td
                          colSpan={2}
                          style={{
                            padding: '8px',
                            textAlign: 'center',
                            color: '#64748b',
                          }}
                        >
                          (Nenhum item retornado)
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
