import { useEffect, useRef, useState } from 'react'
import { LifeBuoy, ChevronDown, ExternalLink, CheckCircle2, Clock } from 'lucide-react'
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

export default function ChamadoKycPanel() {
  const { chamado, mensagens, aberto, resolvido, linkVerificacao, recarregar } = useChamadoKyc()
  const [minimizado, setMinimizado] = useState(leMinimizado)
  const [dispensado, setDispensado] = useState(false)
  const fim = useRef<HTMLDivElement | null>(null)

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

  const naoLidas = mensagens.filter(m => m.autor === 'admin').length

  if (minimizado) {
    return (
      <button
        type="button"
        onClick={() => { setMinimizado(false); void recarregar() }}
        aria-label="Abrir o chamado de verificação"
        style={{
          position: 'fixed', right: 14,
          bottom: 'calc(88px + env(safe-area-inset-bottom))',
          zIndex: 1400, border: 'none', cursor: 'pointer',
          width: 52, height: 52, borderRadius: 26,
          background: resolvido ? '#148447' : '#b54708', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(15,23,42,.28)',
        }}
      >
        {resolvido ? <CheckCircle2 size={22} /> : <LifeBuoy size={22} />}
        {!resolvido && naoLidas > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20,
            borderRadius: 10, background: '#e11d48', color: '#fff',
            fontSize: 11, fontWeight: 900, display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '0 5px',
            border: '2px solid #fff',
          }}>{naoLidas}</span>
        )}
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
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px',
        background: resolvido ? '#eaf8ef' : '#fff4e5',
        borderBottom: `1px solid ${resolvido ? '#a7dfbd' : '#f4d39f'}`,
      }}>
        <div style={{ color: resolvido ? '#148447' : '#b54708', display: 'flex' }}>
          {resolvido ? <CheckCircle2 size={18} /> : <LifeBuoy size={18} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 900, color: resolvido ? '#148447' : '#b54708' }}>
            {resolvido ? 'Verificação concluída' : 'Chamado aberto'}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 650, color: resolvido ? '#148447' : '#b54708', opacity: .85 }}>
            {resolvido ? 'Sua conta está liberada' : 'Estamos preparando o seu link'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMinimizado(true)}
          aria-label="Minimizar"
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: resolvido ? '#148447' : '#b54708', padding: 4, display: 'flex',
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
                background: '#b54708', color: '#fff', fontSize: 13.5, fontWeight: 900,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              }}
            >
              <ExternalLink size={16} /> Fazer a verificação agora
            </button>
            <div style={{ marginTop: 7, fontSize: 11, fontWeight: 650, color: '#b54708', lineHeight: 1.45 }}>
              O link vale poucos minutos e quem preenche é o titular da conta, com documento em mãos.
              Se vencer, é só avisar aqui que a gente manda outro.
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
