import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Ticket, X, Check, Copy, KeyRound, LoaderCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { copiarTexto } from '../lib/clipboard'

// Painel de cupons da Home.
//
// Antes, o botao "Cupons" so rolava a pagina ate uma secao la embaixo, e tocar
// num cupom copiava o codigo SEM dizer nada — o cliente nao sabia se algo
// tinha acontecido. E nao havia como resgatar um codigo recebido por fora:
// cupom privado nem aparece na listagem (o RLS so devolve `publico = true`),
// entao digitar nao levava a lugar nenhum.
//
// Aqui as duas coisas: a lista do que esta valendo, e o campo para quem
// recebeu um codigo. Quem valida o codigo digitado e o banco, pela funcao
// `consultar_cupom` — inclusive cupom privado, sem expor a tabela.

export type CupomLista = {
  id: string
  codigo: string
  titulo: string
  descricao: string | null
  tipo: 'percentual' | 'valor_fixo' | 'frete_gratis'
  valor: number
  valor_minimo: number
  validade: string | null
}

type Resgatado = {
  codigo: string
  titulo: string
  tipo: string
  valor: number
  valor_minimo: number
  validade: string | null
}

/** Onde guardamos o codigo resgatado ate o cliente chegar no checkout. */
export const CUPOM_GUARDADO = 'praiago:cliente:cupom'

const MOTIVOS: Record<string, string> = {
  entre_na_conta: 'Entre na sua conta para usar cupom.',
  nao_encontrado: 'Código não encontrado. Confira as letras e tente de novo.',
  nao_liberado: 'Esse cupom ainda não começou a valer.',
  expirado: 'Esse cupom já expirou.',
  esgotado: 'Esse cupom já atingiu o limite de usos.',
  ja_usado: 'Você já usou esse cupom nesta conta.',
}

export function textoDesconto(tipo: string, valor: number) {
  if (tipo === 'frete_gratis') return 'Frete grátis'
  if (tipo === 'percentual') return `${Number(valor)}% OFF`
  return `R$ ${Number(valor).toFixed(2).replace('.', ',')} OFF`
}

export default function CuponsPanel({
  aberto,
  cupons,
  onFechar,
}: {
  aberto: boolean
  cupons: CupomLista[]
  onFechar: () => void
}) {
  const [codigo, setCodigo] = useState('')
  const [conferindo, setConferindo] = useState(false)
  const [erro, setErro] = useState('')
  const [resgatado, setResgatado] = useState<Resgatado | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  const campo = useRef<HTMLInputElement | null>(null)

  // Mostra de novo o que ja foi resgatado antes: some da tela seria perder o
  // unico lugar onde o cliente ve o codigo privado dele.
  useEffect(() => {
    if (!aberto) return
    setErro('')
    try {
      const bruto = localStorage.getItem(CUPOM_GUARDADO)
      if (bruto) setResgatado(JSON.parse(bruto) as Resgatado)
    } catch { /* storage bloqueado — segue sem lembrar */ }
  }, [aberto])

  async function conferir() {
    const c = codigo.trim().toUpperCase()
    if (!c || conferindo) return
    setConferindo(true)
    setErro('')

    const { data, error } = await supabase.rpc('consultar_cupom', { p_codigo: c })
    setConferindo(false)

    if (error) {
      setErro('Não deu pra conferir agora. Tente de novo em instantes.')
      return
    }

    const r = data as { ok?: boolean; motivo?: string } & Resgatado
    if (!r?.ok) {
      setErro(MOTIVOS[r?.motivo ?? ''] || 'Cupom indisponível.')
      return
    }

    const guardar: Resgatado = {
      codigo: r.codigo, titulo: r.titulo, tipo: r.tipo,
      valor: Number(r.valor), valor_minimo: Number(r.valor_minimo || 0),
      validade: r.validade ?? null,
    }
    setResgatado(guardar)
    setCodigo('')
    // Guardado para o checkout preencher sozinho. O desconto em si continua
    // sendo calculado la, que e quem conhece a loja e o valor do carrinho.
    try { localStorage.setItem(CUPOM_GUARDADO, JSON.stringify(guardar)) } catch { /* ok */ }
  }

  async function copiar(c: string) {
    if (await copiarTexto(c)) {
      setCopiado(c)
      setTimeout(() => setCopiado(null), 2000)
    }
  }

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onFechar}
          style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label="Cupons"
            style={{
              width: '100%', maxWidth: 520, background: '#fff',
              borderRadius: '24px 24px 0 0', padding: '20px 18px',
              paddingBottom: 'calc(22px + env(safe-area-inset-bottom))',
              // dvh acompanha o teclado do iPhone; com vh o campo de digitar
              // ficava atras dele.
              maxHeight: '86dvh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Ticket size={19} color="#ea580c" />
                <span style={{ fontSize: 17, fontWeight: 900, color: '#0f172a' }}>Cupons</span>
              </div>
              <button type="button" onClick={onFechar} aria-label="Fechar" style={{ border: 0, background: '#f1f5f9', borderRadius: 999, width: 32, height: 32, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                <X size={16} color="#475569" />
              </button>
            </div>

            {/* Resgate por código */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 18, padding: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
                <KeyRound size={15} color="#0284c7" />
                <span style={{ fontSize: 13, fontWeight: 900, color: '#0f172a' }}>Tenho um código</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  ref={campo}
                  value={codigo}
                  onChange={e => { setCodigo(e.target.value.toUpperCase()); setErro('') }}
                  onKeyDown={e => { if (e.key === 'Enter') void conferir() }}
                  placeholder="DIGITE O CÓDIGO"
                  aria-label="Código do cupom"
                  maxLength={40}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  style={{
                    flex: 1, minWidth: 0, background: '#fff', color: '#0f172a',
                    border: '1px solid #cbd5e1', borderRadius: 14,
                    // 16px: abaixo disso o Safari do iPhone da zoom ao focar.
                    padding: '12px 14px', fontSize: 16, fontWeight: 800,
                    letterSpacing: 1, outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => void conferir()}
                  disabled={!codigo.trim() || conferindo}
                  style={{
                    flexShrink: 0, padding: '0 18px', borderRadius: 14, border: 'none',
                    background: (!codigo.trim() || conferindo) ? '#e2e8f0' : 'linear-gradient(135deg,#0ea5e9,#22c55e)',
                    color: (!codigo.trim() || conferindo) ? '#94a3b8' : '#fff',
                    fontSize: 13.5, fontWeight: 900,
                    cursor: (!codigo.trim() || conferindo) ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {conferindo ? <LoaderCircle size={15} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                  Usar
                </button>
              </div>

              {erro && (
                <div style={{ marginTop: 9, fontSize: 12, fontWeight: 750, color: '#dc2626', lineHeight: 1.4 }}>{erro}</div>
              )}

              {resgatado && (
                <div style={{ marginTop: 11, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 14, padding: '11px 13px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Check size={15} color="#15803d" />
                    <span style={{ fontSize: 13, fontWeight: 900, color: '#166534' }}>{resgatado.titulo}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 900, color: '#fff', background: '#16a34a', padding: '3px 8px', borderRadius: 999 }}>
                      {textoDesconto(resgatado.tipo, resgatado.valor)}
                    </span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 11.5, fontWeight: 700, color: '#15803d', lineHeight: 1.4 }}>
                    Guardamos o código <strong>{resgatado.codigo}</strong>. Ele aparece
                    sozinho no seu próximo pedido.
                    {resgatado.valor_minimo > 0 && ` Pedido mínimo R$ ${resgatado.valor_minimo.toFixed(2).replace('.', ',')}.`}
                  </div>
                </div>
              )}
            </div>

            {/* Lista pública */}
            <div style={{ fontSize: 12.5, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              Disponíveis agora
            </div>

            {cupons.length === 0 ? (
              <div style={{ borderRadius: 18, padding: 16, background: '#fff7ed', border: '1px dashed #fb923c', fontSize: 12.5, fontWeight: 700, color: '#c2410c', lineHeight: 1.5 }}>
                Nenhum cupom liberado no momento. Quando uma loja soltar desconto,
                ele aparece aqui — e se você recebeu um código, use o campo acima.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {cupons.map(c => (
                  <div key={c.id} style={{ borderRadius: 18, padding: 14, background: '#fff7ed', border: '1px dashed #fb923c', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 15, background: '#fed7aa', color: '#c2410c', display: 'grid', placeItems: 'center' }}>
                      <Ticket size={21} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 900, color: '#9a3412' }}>{c.titulo}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 900, color: '#fff', background: '#ea580c', padding: '3px 8px', borderRadius: 999 }}>
                          {textoDesconto(c.tipo, c.valor)}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, fontWeight: 750, color: '#c2410c', marginTop: 4 }}>
                        {c.codigo}
                        {c.valor_minimo > 0 && ` · mínimo R$ ${Number(c.valor_minimo).toFixed(2).replace('.', ',')}`}
                      </div>
                      {c.validade && (
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9a3412', marginTop: 2 }}>
                          Válido até {new Date(c.validade).toLocaleDateString('pt-BR')}
                        </div>
                      )}
                    </div>
                    {/* Copiar com resposta na tela. Antes copiava calado, e o
                        cliente tocava de novo achando que nao tinha funcionado. */}
                    <button
                      type="button"
                      onClick={() => void copiar(c.codigo)}
                      aria-label={`Copiar cupom ${c.codigo}`}
                      style={{
                        flexShrink: 0, border: 0, borderRadius: 12, cursor: 'pointer',
                        padding: '9px 11px', fontSize: 11.5, fontWeight: 900,
                        background: copiado === c.codigo ? '#dcfce7' : '#fff',
                        color: copiado === c.codigo ? '#15803d' : '#c2410c',
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      {copiado === c.codigo ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
