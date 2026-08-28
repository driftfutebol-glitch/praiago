import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, X, Check, Store, Umbrella } from 'lucide-react'
import {
  CIDADES_ATENDIDAS,
  CENTROS_CIDADES,
  encontrarCidadeAtendida,
  RAIO_PEDIDO_KM,
  type CidadeAtendida,
} from '../lib/serviceArea'
import type { Vendedor } from '../lib/catalogo'

// Seletor de regiao da Home.
//
// A contagem por cidade e REAL: classifica cada vendedor do catalogo pela
// posicao dele. Hoje isso resulta em zero para Santos e Sao Vicente, e o
// componente diz isso na cara — e melhor do que prometer cobertura que nao
// existe e o usuario descobrir sozinho depois de escolher.

type Contagem = { ambulantes: number; restaurantes: number }

export function contarPorCidade(vendedores: Vendedor[]): Record<CidadeAtendida, Contagem> {
  const base = {} as Record<CidadeAtendida, Contagem>
  for (const c of CIDADES_ATENDIDAS) base[c] = { ambulantes: 0, restaurantes: 0 }

  for (const v of vendedores) {
    if (!v.pos) continue
    const cidade = encontrarCidadeAtendida(v.pos[0], v.pos[1])
    if (!cidade) continue
    if (v.tipo === 'restaurante') base[cidade].restaurantes += 1
    else base[cidade].ambulantes += 1
  }
  return base
}

export default function SeletorRegiao({
  aberto,
  vendedores,
  cidadeAtual,
  onEscolher,
  onFechar,
}: {
  aberto: boolean
  vendedores: Vendedor[]
  cidadeAtual: CidadeAtendida | null
  onEscolher: (cidade: CidadeAtendida, centro: [number, number]) => void
  onFechar: () => void
}) {
  const contagem = useMemo(() => contarPorCidade(vendedores), [vendedores])

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onFechar}
          style={{
            position: 'fixed', inset: 0, zIndex: 1200,
            background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label="Selecionar região"
            style={{
              width: '100%', maxWidth: 520, background: '#fff',
              borderRadius: '24px 24px 0 0', padding: '20px 18px 26px',
              maxHeight: '82vh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <MapPin size={19} color="#0891b2" />
                <span style={{ fontSize: 17, fontWeight: 900, color: '#0f172a' }}>Selecionar região</span>
              </div>
              <button
                type="button"
                onClick={onFechar}
                aria-label="Fechar"
                style={{ border: 0, background: '#f1f5f9', borderRadius: 999, width: 32, height: 32, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
              >
                <X size={16} color="#475569" />
              </button>
            </div>

            <p style={{ margin: '0 0 16px', fontSize: 12.5, lineHeight: 1.5, fontWeight: 600, color: '#64748b' }}>
              Você pode ver qualquer região de onde estiver. Para fechar um pedido
              é preciso estar a até {RAIO_PEDIDO_KM} km da loja escolhida.
            </p>

            <div style={{ display: 'grid', gap: 10 }}>
              {CIDADES_ATENDIDAS.map(cidade => {
                const c = contagem[cidade]
                const total = c.ambulantes + c.restaurantes
                const vazia = total === 0
                const atual = cidadeAtual === cidade

                return (
                  <button
                    key={cidade}
                    type="button"
                    onClick={() => { onEscolher(cidade, CENTROS_CIDADES[cidade]); onFechar() }}
                    style={{
                      width: '100%', textAlign: 'left', cursor: 'pointer',
                      border: `1.5px solid ${atual ? '#0891b2' : vazia ? '#e2e8f0' : '#bae6fd'}`,
                      background: atual ? '#ecfeff' : vazia ? '#f8fafc' : '#fff',
                      borderRadius: 16, padding: '13px 15px',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 14.5, fontWeight: 900, color: vazia ? '#64748b' : '#0f172a' }}>{cidade}</span>
                        {atual && <Check size={14} color="#0891b2" />}
                      </div>

                      {vazia ? (
                        <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 650, color: '#94a3b8' }}>
                          Nenhum vendedor cadastrado ainda — em breve
                        </div>
                      ) : (
                        <div style={{ marginTop: 5, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 800, color: '#059669' }}>
                            <Umbrella size={12} /> {c.ambulantes} {c.ambulantes === 1 ? 'ambulante' : 'ambulantes'}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 800, color: '#ea580c' }}>
                            <Store size={12} /> {c.restaurantes} {c.restaurantes === 1 ? 'restaurante' : 'restaurantes'}
                          </span>
                        </div>
                      )}
                    </div>

                    <span
                      style={{
                        flexShrink: 0, fontSize: 10, fontWeight: 900, letterSpacing: 0.4,
                        padding: '5px 10px', borderRadius: 999,
                        background: vazia ? '#f1f5f9' : '#dcfce7',
                        color: vazia ? '#94a3b8' : '#15803d',
                      }}
                    >
                      {vazia ? 'SEM VENDEDOR' : `${total} ${total === 1 ? 'DISPONÍVEL' : 'DISPONÍVEIS'}`}
                    </span>
                  </button>
                )
              })}
            </div>

            <p style={{ margin: '16px 0 0', fontSize: 11.5, lineHeight: 1.5, fontWeight: 600, color: '#94a3b8' }}>
              Contagem em tempo real do catálogo. O PraiaGo está começando pela
              Baixada Santista, SP — Brasil.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
