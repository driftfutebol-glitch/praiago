// Tela do vendedor pra PEDIR a troca do nome da loja.
//
// O vendedor nunca escreve em `profiles.nome` daqui: ele cria uma solicitacao
// e o admin decide. Quando o admin aprova, e a funcao `aprovar_troca_nome` que
// grava o nome novo — por isso esta tela nao tem botao de "salvar nome".
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock, Loader2, Send, Signature, XCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  MAX_NOME_LOJA, cancelarTrocaNome, pedirTrocaNome, ultimaSolicitacaoTrocaNome,
  validarPedidoTrocaNome, type SolicitacaoTrocaNome,
} from '../lib/trocaNome'

type Props = {
  vendedorId: string
  nomeAtual: string
  /** Chamado quando o pedido aprovado ja refletiu no perfil, pra recarregar a tela. */
  onNomeAprovado?: (nomeNovo: string) => void
}

const caixa: React.CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'flex-start',
  borderRadius: 16, padding: 14, fontSize: 13, fontWeight: 700, lineHeight: 1.45,
}

export default function TrocaNomeLoja({ vendedorId, nomeAtual, onNomeAprovado }: Props) {
  const [solicitacao, setSolicitacao] = useState<SolicitacaoTrocaNome | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [nomeNovo, setNomeNovo] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  // O callback fica em ref porque o pai costuma passar uma arrow inline: se ele
  // entrasse nas dependencias, cada render criaria um `carregar` novo e o
  // efeito abaixo viraria laco infinito de consultas.
  const onNomeAprovadoRef = useRef(onNomeAprovado)
  onNomeAprovadoRef.current = onNomeAprovado

  const carregar = useCallback(async () => {
    if (!vendedorId) return
    const atual = await ultimaSolicitacaoTrocaNome(vendedorId)
    setSolicitacao(atual)
    setCarregando(false)
    // A aprovacao acontece fora do app (painel do admin) e a tabela nao esta na
    // publicacao de realtime — entao o nome novo so chega numa nova consulta.
    // Avisa o pai pra ele atualizar o cabecalho sem esperar um F5.
    if (atual?.status === 'aprovada') onNomeAprovadoRef.current?.(atual.nome_novo)
  }, [vendedorId])

  useEffect(() => { void carregar() }, [carregar])

  async function enviar() {
    const msg = validarPedidoTrocaNome(nomeNovo, nomeAtual, motivo)
    if (msg) { setErro(msg); return }
    setErro(''); setAviso(''); setEnviando(true)
    const resultado = await pedirTrocaNome({ vendedorId, nomeAtual, nomeNovo, motivo })
    setEnviando(false)
    if (!resultado.ok) { setErro(resultado.erro); return }
    setSolicitacao(resultado.solicitacao)
    setNomeNovo(''); setMotivo('')
    setAviso('Pedido enviado. A equipe PraiaGo vai analisar e responder por aqui.')
  }

  async function cancelar() {
    if (!solicitacao) return
    setErro(''); setAviso(''); setEnviando(true)
    const resultado = await cancelarTrocaNome(solicitacao.id)
    setEnviando(false)
    if (!resultado.ok) { setErro(resultado.erro); void carregar(); return }
    setSolicitacao(resultado.solicitacao)
    setAviso('Pedido cancelado. Voce pode enviar outro quando quiser.')
  }

  const pendente = solicitacao?.status === 'pendente'

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      className="glass-panel"
      style={{ borderRadius: 24, padding: 24, border: '1px solid rgba(0,0,0,0.06)', background: '#ffffff' }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Signature size={16} color="#7c3aed" /> Nome da loja
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, color: '#64748b', letterSpacing: 0.5 }}>NOME ATUAL</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>{nomeAtual || '—'}</div>
        </div>

        <p style={{ fontSize: 13, color: '#64748b', fontWeight: 500, margin: 0 }}>
          E esse nome que o cliente reconhece no app e nos pedidos antigos, entao a troca passa pela
          equipe PraiaGo. Envie o nome novo com o motivo e a gente responde por aqui.
        </p>

        {carregando && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 13, fontWeight: 700 }}>
            <Loader2 size={16} className="animate-spin-slow" /> Conferindo se voce ja tem um pedido...
          </div>
        )}

        {!carregando && pendente && solicitacao && (
          <div style={{ ...caixa, border: '1px solid rgba(245,158,11,0.3)', background: '#fffbeb', color: '#92400e', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Clock size={20} color="#d97706" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 900 }}>Aguardando aprovacao do admin</div>
                <div style={{ color: '#a16207', fontSize: 12.5, marginTop: 4 }}>
                  Nome pedido: <strong>{solicitacao.nome_novo}</strong>
                  {solicitacao.motivo ? ` · ${solicitacao.motivo}` : ''}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={cancelar}
              disabled={enviando}
              style={{ alignSelf: 'flex-start', border: '1px solid rgba(148,163,184,0.5)', background: '#fff', color: '#475569', borderRadius: 12, padding: '9px 14px', fontSize: 12.5, fontWeight: 900, cursor: enviando ? 'wait' : 'pointer' }}
            >
              Cancelar pedido
            </button>
          </div>
        )}

        {!carregando && solicitacao?.status === 'aprovada' && (
          <div style={{ ...caixa, border: '1px solid rgba(34,197,94,0.3)', background: '#f0fdf4', color: '#166534' }}>
            <CheckCircle2 size={20} color="#16a34a" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 900 }}>Troca aprovada</div>
              <div style={{ color: '#15803d', fontSize: 12.5, marginTop: 4 }}>
                A loja passou a se chamar <strong>{solicitacao.nome_novo}</strong>.
                {solicitacao.observacao_admin ? ` Admin: ${solicitacao.observacao_admin}` : ''}
              </div>
            </div>
          </div>
        )}

        {!carregando && solicitacao?.status === 'recusada' && (
          <div style={{ ...caixa, border: '1px solid rgba(239,68,68,0.25)', background: '#fef2f2', color: '#991b1b' }}>
            <XCircle size={20} color="#dc2626" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 900 }}>Troca nao aprovada</div>
              <div style={{ color: '#b91c1c', fontSize: 12.5, marginTop: 4 }}>
                {solicitacao.observacao_admin || 'A equipe nao deixou observacao. Fale com o suporte se precisar de detalhes.'}
              </div>
            </div>
          </div>
        )}

        {!carregando && !pendente && (
          <>
            <div>
              <label style={{ fontSize: 11, fontWeight: 900, color: '#64748b', display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>NOVO NOME</label>
              <input
                value={nomeNovo}
                onChange={e => { setNomeNovo(e.target.value); setErro('') }}
                maxLength={MAX_NOME_LOJA}
                placeholder="Como a loja deve aparecer pro cliente"
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: 12, fontSize: 15, fontWeight: 700, color: '#0f172a', background: '#f8fafc' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 900, color: '#64748b', display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>POR QUE ESTA TROCANDO?</label>
              <textarea
                value={motivo}
                onChange={e => { setMotivo(e.target.value); setErro('') }}
                rows={3}
                maxLength={500}
                placeholder="Ex.: registrei a loja com o nome errado no cadastro."
                style={{ display: 'block', width: '100%', boxSizing: 'border-box', resize: 'vertical', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: 12, background: '#f8fafc', color: '#0f172a', fontSize: 14, fontWeight: 650 }}
              />
            </div>
            <button
              type="button"
              onClick={enviar}
              disabled={enviando}
              style={{ width: '100%', border: '1px solid rgba(124,58,237,0.25)', background: '#f5f3ff', color: '#7c3aed', borderRadius: 16, padding: 16, fontSize: 14, fontWeight: 900, cursor: enviando ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
            >
              {enviando ? <Loader2 size={18} className="animate-spin-slow" /> : <Send size={18} />}
              {enviando ? 'Enviando...' : 'Pedir troca de nome'}
            </button>
          </>
        )}

        {erro && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444', fontSize: 13, fontWeight: 800 }}>
            <AlertCircle size={15} /> {erro}
          </div>
        )}
        {aviso && <div role="status" style={{ color: '#16a34a', fontSize: 13, fontWeight: 800 }}>{aviso}</div>}
      </div>
    </motion.div>
  )
}
