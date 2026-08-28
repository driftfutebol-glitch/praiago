// Tela do vendedor pra PEDIR a troca do nome da banca.
//
// O vendedor nunca escreve em `profiles.nome` daqui: ele cria uma solicitacao
// e o admin decide. Quando o admin aprova, e a funcao `aprovar_troca_nome` que
// grava o nome novo — por isso esta tela nao tem botao de "salvar nome".
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock3, Loader2, Send, Signature, XCircle } from 'lucide-react'
import {
  MAX_NOME_LOJA, cancelarTrocaNome, pedirTrocaNome, ultimaSolicitacaoTrocaNome,
  validarPedidoTrocaNome, type SolicitacaoTrocaNome,
} from '../lib/trocaNome'

type Props = {
  vendedorId: string
  nomeAtual: string
  /** Chamado quando o pedido ja foi aprovado, pra recarregar o perfil. */
  onNomeAprovado?: (nomeNovo: string) => void
}

const campo: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 44,
  marginTop: 6,
  padding: '11px 10px',
  border: '1px solid #dfe6ed',
  borderRadius: 8,
  background: '#f8fafc',
  color: '#132238',
  fontSize: 14,
  fontWeight: 700,
}

const faixa: React.CSSProperties = {
  display: 'flex',
  gap: 9,
  alignItems: 'flex-start',
  marginTop: 12,
  borderRadius: 8,
  padding: 11,
  fontSize: 12,
  lineHeight: 1.4,
  fontWeight: 700,
}

export default function TrocaNomeLoja({ vendedorId, nomeAtual, onNomeAprovado }: Props) {
  const [solicitacao, setSolicitacao] = useState<SolicitacaoTrocaNome | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [nomeNovo, setNomeNovo] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  // Ref porque o pai passa arrow inline: nas dependencias, cada render criaria
  // um `carregar` novo e o efeito viraria laco infinito de consultas.
  const onNomeAprovadoRef = useRef(onNomeAprovado)
  onNomeAprovadoRef.current = onNomeAprovado

  const carregar = useCallback(async () => {
    if (!vendedorId) return
    const atual = await ultimaSolicitacaoTrocaNome(vendedorId)
    setSolicitacao(atual)
    setCarregando(false)
    // A decisao vem do painel do admin e a tabela nao esta na publicacao de
    // realtime, entao o nome novo so chega numa nova consulta.
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
    setAviso('Pedido enviado. A equipe PraiaGo responde por aqui.')
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
    <section className="surface" style={{ marginBottom: 14, padding: 15, boxShadow: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Signature size={18} color="#008fc0" />
        <div>
          <div style={{ color: '#132238', fontSize: 14, fontWeight: 900 }}>Nome da banca</div>
          <div style={{ marginTop: 2, color: '#617089', fontSize: 11, fontWeight: 600 }}>
            E o nome que o cliente reconhece no app, entao a troca passa pela equipe PraiaGo.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, padding: 11, borderRadius: 8, background: '#f2f5f7' }}>
        <span className="field-label">Nome atual</span>
        <div style={{ marginTop: 3, color: '#132238', fontSize: 15, fontWeight: 900 }}>{nomeAtual || '—'}</div>
      </div>

      {carregando && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, color: '#617089', fontSize: 12, fontWeight: 700 }}>
          <Loader2 size={15} className="animate-spin-slow" /> Conferindo se voce ja tem um pedido...
        </div>
      )}

      {!carregando && pendente && solicitacao && (
        <div style={{ ...faixa, flexDirection: 'column', gap: 10, background: '#fff4e5', border: '1px solid rgba(181,71,8,0.2)', color: '#b54708' }}>
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
            <Clock3 size={16} style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 900 }}>Aguardando aprovacao do admin</div>
              <div style={{ marginTop: 3, fontWeight: 650 }}>
                Nome pedido: <strong>{solicitacao.nome_novo}</strong>
                {solicitacao.motivo ? ` · ${solicitacao.motivo}` : ''}
              </div>
            </div>
          </div>
          <button type="button" className="secondary-button" onClick={() => void cancelar()} disabled={enviando} style={{ alignSelf: 'flex-start', minHeight: 38 }}>
            Cancelar pedido
          </button>
        </div>
      )}

      {!carregando && solicitacao?.status === 'aprovada' && (
        <div style={{ ...faixa, background: '#eaf8ef', border: '1px solid rgba(20,132,71,0.2)', color: '#148447' }}>
          <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 900 }}>Troca aprovada</div>
            <div style={{ marginTop: 3, fontWeight: 650 }}>
              A banca passou a se chamar <strong>{solicitacao.nome_novo}</strong>.
              {solicitacao.observacao_admin ? ` Admin: ${solicitacao.observacao_admin}` : ''}
            </div>
          </div>
        </div>
      )}

      {!carregando && solicitacao?.status === 'recusada' && (
        <div style={{ ...faixa, background: '#fff1f3', border: '1px solid rgba(180,35,53,0.2)', color: '#b42335' }}>
          <XCircle size={16} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 900 }}>Troca nao aprovada</div>
            <div style={{ marginTop: 3, fontWeight: 650 }}>
              {solicitacao.observacao_admin || 'A equipe nao deixou observacao. Fale com o suporte se precisar de detalhes.'}
            </div>
          </div>
        </div>
      )}

      {!carregando && !pendente && (
        <>
          <label style={{ display: 'block', marginTop: 12 }}>
            <span className="field-label">Novo nome</span>
            <input
              value={nomeNovo}
              onChange={event => { setNomeNovo(event.target.value); setErro('') }}
              maxLength={MAX_NOME_LOJA}
              placeholder="Como a banca deve aparecer pro cliente"
              style={campo}
            />
          </label>
          <label style={{ display: 'block', marginTop: 10 }}>
            <span className="field-label">Por que esta trocando?</span>
            <textarea
              value={motivo}
              onChange={event => { setMotivo(event.target.value); setErro('') }}
              rows={3}
              maxLength={500}
              placeholder="Ex.: registrei a banca com o nome errado no cadastro."
              style={{ ...campo, resize: 'vertical', fontWeight: 600 }}
            />
          </label>
          <button type="button" className="primary-button" onClick={() => void enviar()} disabled={enviando} style={{ width: '100%', marginTop: 11 }}>
            {enviando ? <Loader2 size={17} className="animate-spin-slow" /> : <Send size={17} />}
            {enviando ? 'Enviando...' : 'Pedir troca de nome'}
          </button>
        </>
      )}

      {erro && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, color: '#b42335', fontSize: 11.5, fontWeight: 750 }}>
          <AlertCircle size={14} /> {erro}
        </div>
      )}
      {aviso && <div role="status" style={{ marginTop: 9, color: '#148447', fontSize: 11.5, fontWeight: 750 }}>{aviso}</div>}
    </section>
  )
}
