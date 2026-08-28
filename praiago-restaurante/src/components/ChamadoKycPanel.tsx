import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ExternalLink, CheckCircle2, Clock, AlertTriangle, RefreshCw } from 'lucide-react'
import { useChamadoKyc } from '../hooks/useChamadoKyc'

// Painel do chamado de verificacao. Copiado identico no ambulante e no
// restaurante.
//
// Fica montado no App, fora das rotas, por um motivo: o vendedor abre o
// chamado e continua trabalhando. Se o painel morasse na tela da Carteira,
// ele sumiria no primeiro toque em "Pedidos" — e o vendedor concluiria que o
// chamado se perdeu. Aqui ele atravessa a navegacao inteira.
//
// Minimizado, vira uma bolinha no canto. A escolha fica no aparelho, entao
// quem minimizou nao encontra o painel aberto de novo a cada tela. O que NAO
// fica guardado no aparelho e o chamado em si: ele vive no banco, entao
// trocar de celular, reinstalar ou limpar o app nao perde nada.

const CHAVE_MIN = 'praiago:vendedor:chamado-kyc-min'

function leMinimizado() {
  try { return localStorage.getItem(CHAVE_MIN) === '1' } catch { return false }
}

function horaCurta(ms: number) {
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** Segundos restantes como m:ss. Zero vira "0:00", nunca negativo. */
function relogio(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function ChamadoKycPanel() {
  const {
    chamado, mensagens, aberto, resolvido,
    linkVerificacao, linkVencido, restaMs, pedirOutroLink, recarregar,
  } = useChamadoKyc()
  const [minimizado, setMinimizado] = useState(leMinimizado)
  const [dispensado, setDispensado] = useState(false)
  const [pedindo, setPedindo] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const [assistenteAberto, setAssistenteAberto] = useState(false)
  const fim = useRef<HTMLDivElement | null>(null)

  // O assistente e este painel dividem o canto inferior direito. Enquanto a
  // janela dele esta aberta, esta some — na primeira versao ficava por cima
  // dos botoes de resposta rapida do chat.
  useEffect(() => {
    const aoMudar = (e: Event) => {
      setAssistenteAberto(!!(e as CustomEvent<{ aberto?: boolean }>).detail?.aberto)
    }
    window.addEventListener('praiago:assistente', aoMudar)
    return () => window.removeEventListener('praiago:assistente', aoMudar)
  }, [])

  useEffect(() => {
    try { localStorage.setItem(CHAVE_MIN, minimizado ? '1' : '0') } catch { /* modo privado */ }
  }, [minimizado])

  // Chegou resposta: abre sozinho. E o unico momento em que vale desrespeitar
  // o "minimizado" — o link vale poucos minutos e esperar o vendedor lembrar
  // de abrir a bolinha seria perder a janela.
  const totalRef = useRef(0)
  useEffect(() => {
    const daGente = mensagens.filter(m => m.autor === 'admin').length
    if (daGente > totalRef.current && totalRef.current > 0) setMinimizado(false)
    totalRef.current = daGente
  }, [mensagens])

  useEffect(() => {
    if (!minimizado) fim.current?.scrollIntoView({ block: 'end' })
  }, [mensagens, minimizado])

  if (!chamado || dispensado) return null
  if (!aberto && !resolvido) return null
  if (assistenteAberto) return null

  const naoLidas = mensagens.filter(m => m.autor === 'admin').length

  if (minimizado) {
    // Fica ACIMA do botao do assistente, que mora em `bottom: 80, right: 24`
    // com zIndex 9999. Na primeira versao este aqui usava bottom 88 e zIndex
    // 1400: caia em cima do outro e ainda por baixo — sumia da tela.
    //
    // E vermelho de proposito. A bolinha verde do assistente e convite; esta
    // e pendencia: enquanto ela estiver ali, o vendedor nao consegue sacar.
    return (
      <button
        type="button"
        onClick={() => { setMinimizado(false); void recarregar() }}
        aria-label="Abrir o chamado de verificação"
        style={{
          position: 'fixed', right: 20,
          bottom: 'calc(150px + env(safe-area-inset-bottom))',
          zIndex: 10000, border: 'none', cursor: 'pointer',
          padding: '10px 14px', borderRadius: 26,
          background: resolvido ? '#148447' : '#c81e3a', color: '#fff',
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12.5, fontWeight: 900,
          boxShadow: resolvido
            ? '0 8px 24px rgba(15,23,42,.28)'
            : '0 8px 26px rgba(200,30,58,.45)',
          animation: resolvido ? undefined : 'pulsarChamado 2.2s ease-in-out infinite',
        }}
      >
        {resolvido ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}
        {resolvido ? 'Conta liberada'
          : linkVerificacao ? 'Faça a verificação · ' + relogio(restaMs)
          : linkVencido ? 'O link venceu'
          : 'Verificação pendente'}
        {!resolvido && naoLidas > 0 && (
          <span style={{
            minWidth: 20, height: 20, borderRadius: 10,
            background: '#fff', color: '#c81e3a',
            fontSize: 11, fontWeight: 900, display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '0 5px',
          }}>{naoLidas}</span>
        )}
        <style>{`
          @keyframes pulsarChamado {
            0%, 100% { box-shadow: 0 8px 26px rgba(200,30,58,.45); }
            50%      { box-shadow: 0 8px 26px rgba(200,30,58,.80); }
          }
        `}</style>
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'fixed', left: 10, right: 10,
        bottom: 'calc(84px + env(safe-area-inset-bottom))',
        zIndex: 1400, maxWidth: 460, margin: '0 auto',
        background: '#fff', borderRadius: 16,
        border: '1px solid #e2e8f0', boxShadow: '0 14px 44px rgba(15,23,42,.20)',
        overflow: 'hidden',
      }}
    >
      {/* Vermelho enquanto pende, verde quando resolve. Nao e enfeite: essa
          e a unica pendencia do app que impede o vendedor de receber o
          proprio dinheiro. Em amarelo, ela se confundia com aviso comum. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px',
        background: resolvido ? '#eaf8ef' : '#fff0f2',
        borderBottom: `1px solid ${resolvido ? '#a7dfbd' : '#f0b6bd'}`,
      }}>
        <div style={{ color: resolvido ? '#148447' : '#c81e3a', display: 'flex' }}>
          {resolvido ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 900, color: resolvido ? '#148447' : '#c81e3a' }}>
            {resolvido ? 'Verificação concluída' : 'Importante · saque bloqueado'}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 650, color: resolvido ? '#148447' : '#c81e3a', opacity: .88 }}>
            {resolvido
              ? 'Sua conta está liberada'
              : linkVerificacao ? 'Seu link chegou — faça agora' : 'Chamado aberto, preparando o seu link'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMinimizado(true)}
          aria-label="Minimizar"
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: resolvido ? '#148447' : '#c81e3a', padding: 4, display: 'flex',
          }}
        >
          <ChevronDown size={19} />
        </button>
      </div>

      <div style={{ maxHeight: '38dvh', overflowY: 'auto', padding: '12px 14px', background: '#f8fafc' }}>
        {mensagens.map(m => {
          const daGente = m.autor === 'admin'
          const doSistema = m.autor === 'sistema'
          return (
            <div key={m.id} style={{ marginBottom: 9 }}>
              <div style={{
                display: 'inline-block', maxWidth: '92%',
                background: doSistema ? '#eef2ff' : daGente ? '#fff' : '#dcfce7',
                border: `1px solid ${doSistema ? '#c7d2fe' : daGente ? '#e2e8f0' : '#bbf7d0'}`,
                borderRadius: 12, padding: '9px 11px',
                fontSize: 13, lineHeight: 1.5, color: '#334155',
                fontWeight: 600, wordBreak: 'break-word',
              }}>
                {doSistema && (
                  <div style={{ fontSize: 10.5, fontWeight: 900, color: '#4338ca', marginBottom: 3, letterSpacing: .4 }}>
                    PRAIAGO
                  </div>
                )}
                {daGente && (
                  <div style={{ fontSize: 10.5, fontWeight: 900, color: '#0f172a', marginBottom: 3, letterSpacing: .4 }}>
                    ATENDIMENTO
                  </div>
                )}
                {m.mensagem}
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, fontWeight: 700 }}>
                  {horaCurta(m.criadaEm)}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={fim} />
      </div>

      <div style={{ padding: '11px 14px', borderTop: '1px solid #eef2f7' }}>
        {resolvido ? (
          <button
            type="button"
            onClick={() => setDispensado(true)}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 12, border: 'none',
              background: '#148447', color: '#fff', fontSize: 13.5, fontWeight: 900, cursor: 'pointer',
            }}
          >
            Entendi, pode fechar
          </button>
        ) : linkVerificacao ? (
          <>
            <button
              type="button"
              onClick={() => window.open(linkVerificacao, '_blank', 'noopener,noreferrer')}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
                background: '#c81e3a', color: '#fff', fontSize: 13.5, fontWeight: 900,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              }}
            >
              <ExternalLink size={16} /> Fazer a verificação · {relogio(restaMs)}
            </button>
            <div style={{ marginTop: 7, fontSize: 11, fontWeight: 650, color: '#c81e3a', lineHeight: 1.45 }}>
              O link vence em {relogio(restaMs)}. Quem preenche é o titular da conta, com documento
              em mãos — se não der tempo, peça outro aqui mesmo.
            </div>
          </>
        ) : linkVencido ? (
          <>
            {/* Botao morto e pior do que botao ausente: o vendedor tocava,
                caia numa pagina vencida e nao tinha como avisar ninguem. */}
            <button
              type="button"
              disabled={pedindo}
              onClick={async () => {
                setPedindo(true)
                const ok = await pedirOutroLink()
                setPedindo(false)
                if (!ok) setFalhou(true)
              }}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
                background: '#0f172a', color: '#fff', fontSize: 13.5, fontWeight: 900,
                cursor: pedindo ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              }}
            >
              <RefreshCw size={15} /> {pedindo ? 'Pedindo…' : 'Pedir outro link'}
            </button>
            <div style={{ marginTop: 7, fontSize: 11, fontWeight: 650, color: '#64748b', lineHeight: 1.45 }}>
              {falhou
                ? 'Não deu pra avisar agora. Tente de novo em instantes.'
                : 'O link anterior venceu — eles duram 5 minutos. Toque acima que a gente gera outro e ele chega aqui.'}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b' }}>
            <Clock size={15} />
            <div style={{ fontSize: 12, fontWeight: 650, lineHeight: 1.45 }}>
              Pode fechar esta janela e continuar trabalhando. O chamado não se perde, e quando o
              link chegar você recebe um aviso.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
