// Pagina /ativar — a pessoa leu o QR entregue pela equipe no evento e cai aqui
// pra escolher a propria senha.
//
// O QR NAO carrega senha nenhuma (quem fotografasse a tela entrava na conta):
// ele carrega um token de uso unico, que esta na URL como ?t=. Tudo que vale
// nesta tela e decidido pela edge function `ativar-conta`.
//
// Premissa de projeto que manda em cada decisao daqui: celular na mao, sol na
// tela, fila andando e 4G ruim. Por isso:
//   * nada de framer-motion nem SDK — a pagina e um chunk separado e magro;
//   * input com fontSize >= 16px (abaixo disso o iPhone da zoom sozinho);
//   * olho pra revelar a senha (no sol ninguem enxerga o que digitou);
//   * botao grande, com estado de "salvando" que impede clique duplo.

import { useEffect, useState } from 'react'
import { CircleAlert, CircleCheckBig, Eye, EyeOff, LoaderCircle, LockKeyhole } from 'lucide-react'
import Marca from '../components/Marca'
import { chamarAtivacao, validarSenha, type Ativacao, type Resultado } from '../lib/ativacao'

type Fase =
  | { nome: 'carregando' }
  | { nome: 'bloqueado'; titulo: string; texto: string; jaUsado: boolean; tentarDeNovo: boolean }
  | { nome: 'formulario'; conta: Ativacao }
  | { nome: 'pronto'; conta: Ativacao }

const ROTULO_ROLE: Record<string, string> = {
  cliente: 'Conta de cliente',
  ambulante: 'Conta de ambulante',
  restaurante: 'Conta de restaurante',
}

/** Traduz a recusa da function numa tela de fim de linha (nao adianta insistir). */
function bloqueioDe(r: Extract<Resultado, { ok: false }>): Fase {
  if (r.jaUsado) {
    return {
      nome: 'bloqueado',
      jaUsado: true,
      tentarDeNovo: false,
      titulo: 'Esse código já foi usado',
      texto: 'A senha desta conta já foi criada. Abra o app e entre com o seu e-mail e a senha que você escolheu.',
    }
  }
  if (r.status === 410) {
    return {
      nome: 'bloqueado',
      jaUsado: false,
      tentarDeNovo: false,
      titulo: 'Código expirado',
      texto: 'O código do QR vale por 48 horas. Procure a equipe PraiaGo pra gerar um novo.',
    }
  }
  if (r.status === 404 || r.status === 400) {
    return {
      nome: 'bloqueado',
      jaUsado: false,
      tentarDeNovo: false,
      titulo: 'Link inválido',
      texto: 'Esse código não existe mais. Leia o QR code de novo ou procure a equipe PraiaGo.',
    }
  }
  // Rede/servidor: aqui vale oferecer o "tentar de novo".
  return {
    nome: 'bloqueado',
    jaUsado: false,
    tentarDeNovo: true,
    titulo: 'Não deu pra abrir agora',
    texto: r.mensagem,
  }
}

export default function Ativar() {
  // Lido uma vez: se a pessoa navegar dentro da pagina o token nao muda.
  const [token] = useState(() => new URLSearchParams(window.location.search).get('t')?.trim() ?? '')
  const [fase, setFase] = useState<Fase>({ nome: 'carregando' })
  const [tentativa, setTentativa] = useState(0)

  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [verSenha, setVerSenha] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    document.title = 'Ativar conta — PraiaGo'
  }, [])

  // Consulta o token pra saber de quem e a conta antes de pedir a senha.
  // `acao: 'consultar'` NAO queima o token, entao rodar duas vezes (StrictMode)
  // e inofensivo.
  useEffect(() => {
    if (!token || token.length < 20) {
      setFase({
        nome: 'bloqueado',
        jaUsado: false,
        tentarDeNovo: false,
        titulo: 'Link inválido',
        texto: 'Este endereço está sem o código de ativação. Leia de novo o QR code que a equipe PraiaGo te mostrou.',
      })
      return
    }

    let vivo = true
    setFase({ nome: 'carregando' })
    chamarAtivacao({ token, acao: 'consultar' }).then((r) => {
      if (!vivo) return
      setFase(r.ok ? { nome: 'formulario', conta: r.dados } : bloqueioDe(r))
    })
    return () => {
      vivo = false
    }
  }, [token, tentativa])

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    if (salvando || fase.nome !== 'formulario') return

    const problema = validarSenha(senha)
    if (problema) return setErro(problema)
    if (senha !== confirmacao) return setErro('As duas senhas não são iguais. Confira e digite de novo.')

    setErro(null)
    setSalvando(true)
    const r = await chamarAtivacao({ token, senha })
    setSalvando(false)

    if (r.ok) {
      setFase({ nome: 'pronto', conta: r.dados })
      return
    }
    // 400 (senha recusada) e falha de rede da pra corrigir sem sair da tela.
    // 404/410 acabou: o token morreu, formulario nao serve mais pra nada.
    if (r.status === 400 || r.status === 0 || r.status >= 500) setErro(r.mensagem)
    else setFase(bloqueioDe(r))
  }

  return (
    <div style={estilos.fundo}>
      <OndasDeFundo />

      <main style={estilos.centro}>
        <a href="/" style={{ display: 'block', marginBottom: 22 }} aria-label="PraiaGo — página inicial">
          <Marca
            largura="clamp(150px, 42vw, 190px)"
            filtro="drop-shadow(0 0 2.5px rgba(0,14,10,0.85)) drop-shadow(0 12px 22px rgba(2,14,9,0.35))"
          />
        </a>

        <section style={estilos.cartao}>
          {fase.nome === 'carregando' && <Carregando />}

          {fase.nome === 'bloqueado' && (
            <Bloqueado fase={fase} onTentarDeNovo={() => setTentativa((n) => n + 1)} />
          )}

          {fase.nome === 'formulario' && (
            <form onSubmit={enviar} noValidate>
              <span style={estilos.selo}>
                <LockKeyhole size={13} strokeWidth={2.6} />
                {ROTULO_ROLE[fase.conta.role] ?? 'Conta PraiaGo'}
              </span>

              <h1 style={estilos.titulo}>
                {fase.conta.nome ? `Olá, ${primeiroNome(fase.conta.nome)}!` : 'Quase lá!'}
              </h1>
              <p style={estilos.subtitulo}>
                Sua conta já está criada. Agora escolha uma senha só sua — a equipe do evento não vai
                saber qual é.
              </p>

              <CampoSenha
                id="senha-nova"
                rotulo="Nova senha"
                valor={senha}
                aoMudar={setSenha}
                visivel={verSenha}
                aoAlternar={() => setVerSenha((v) => !v)}
                autoFocus
              />
              <CampoSenha
                id="senha-confirma"
                rotulo="Repita a senha"
                valor={confirmacao}
                aoMudar={setConfirmacao}
                visivel={verSenha}
                aoAlternar={() => setVerSenha((v) => !v)}
              />

              <p style={estilos.dica}>Mínimo de 8 caracteres, com pelo menos uma letra.</p>

              {erro && <Aviso texto={erro} />}

              <button
                type="submit"
                disabled={salvando}
                style={{ ...estilos.botao, ...(salvando ? estilos.botaoOcupado : null) }}
              >
                {salvando ? (
                  <>
                    <LoaderCircle size={20} strokeWidth={2.6} className="girando" />
                    Salvando…
                  </>
                ) : (
                  'Salvar senha'
                )}
              </button>
            </form>
          )}

          {fase.nome === 'pronto' && <Pronto conta={fase.conta} />}
        </section>

        <p style={estilos.rodape}>
          Problema com o código? Fale com a equipe PraiaGo no evento ou escreva pra{' '}
          <a href="mailto:contato@praiago.com.br" style={estilos.linkRodape}>
            contato@praiago.com.br
          </a>
          .
        </p>
      </main>

      <style>{`
        @keyframes girar { to { transform: rotate(360deg); } }
        .girando { animation: girar 0.9s linear infinite; }
        .campo-ativar:focus {
          outline: none;
          border-color: #0ea5e9;
          box-shadow: 0 0 0 4px rgba(14,165,233,0.16);
        }
        .campo-ativar::placeholder { color: #94a3b8; }
        .olho-ativar:active { background: #e2e8f0; }
      `}</style>
    </div>
  )
}

/* ── Pedacos da tela ─────────────────────────────────────────── */

function Carregando() {
  return (
    <div style={{ padding: '30px 0', textAlign: 'center', color: '#64748b' }}>
      <LoaderCircle size={30} strokeWidth={2.4} className="girando" color="#0ea5e9" />
      <p style={{ margin: '14px 0 0', fontSize: 15.5, fontWeight: 600 }}>Conferindo seu código…</p>
    </div>
  )
}

function Bloqueado({
  fase,
  onTentarDeNovo,
}: {
  fase: Extract<Fase, { nome: 'bloqueado' }>
  onTentarDeNovo: () => void
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={estilos.icone('#fef2f2')}>
        <CircleAlert size={30} strokeWidth={2.3} color="#dc2626" />
      </div>
      <h1 style={{ ...estilos.titulo, marginTop: 18 }}>{fase.titulo}</h1>
      <p style={{ ...estilos.subtitulo, marginBottom: 26 }}>{fase.texto}</p>

      {fase.tentarDeNovo && (
        <button type="button" onClick={onTentarDeNovo} style={estilos.botao}>
          Tentar de novo
        </button>
      )}
      <a
        href="/"
        style={fase.tentarDeNovo ? { ...estilos.botaoFantasma, marginTop: 10 } : estilos.botaoFantasma}
      >
        Voltar pro site
      </a>
    </div>
  )
}

function Pronto({ conta }: { conta: Ativacao }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={estilos.icone('#f0fdf4')}>
        <CircleCheckBig size={30} strokeWidth={2.3} color="#16a34a" />
      </div>
      <h1 style={{ ...estilos.titulo, marginTop: 18 }}>Senha criada!</h1>
      <p style={{ ...estilos.subtitulo, marginBottom: 26 }}>
        {conta.nome ? `Tudo certo, ${primeiroNome(conta.nome)}. ` : 'Tudo certo. '}
        Daqui pra frente é só entrar com o seu e-mail e essa senha.
      </p>

      {/* O destino vem da function: loja do app, painel do restaurante ou uma
          pagina do site quando o app ainda nao esta publicado. */}
      {/* Mesma aba de proposito: link de loja abre a Play Store/App Store no
          app nativo, e aba nova so deixaria uma aba orfa no celular. */}
      <a href={conta.destino.url} style={estilos.botao}>
        {conta.destino.rotulo}
      </a>

      {conta.destino.tipo === 'pendente' && (
        <p style={{ margin: '14px 0 0', fontSize: 13.5, lineHeight: 1.55, color: '#64748b' }}>
          O app ainda está saindo na loja. Sua conta já está pronta e te esperando.
        </p>
      )}
    </div>
  )
}

function CampoSenha({
  id,
  rotulo,
  valor,
  aoMudar,
  visivel,
  aoAlternar,
  autoFocus,
}: {
  id: string
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  visivel: boolean
  aoAlternar: () => void
  autoFocus?: boolean
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label htmlFor={id} style={estilos.rotulo}>
        {rotulo}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          className="campo-ativar"
          type={visivel ? 'text' : 'password'}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          // Foco automatico so no primeiro campo: digitar a senha e a unica
          // coisa que existe pra fazer aqui, entao o teclado ja pode subir.
          autoFocus={autoFocus}
          style={estilos.campo}
        />
        <button
          type="button"
          className="olho-ativar"
          onClick={aoAlternar}
          aria-label={visivel ? 'Esconder senha' : 'Mostrar senha'}
          aria-pressed={visivel}
          style={estilos.olho}
        >
          {visivel ? <EyeOff size={21} strokeWidth={2.2} /> : <Eye size={21} strokeWidth={2.2} />}
        </button>
      </div>
    </div>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <p role="alert" style={estilos.aviso}>
      <CircleAlert size={17} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{texto}</span>
    </p>
  )
}

function OndasDeFundo() {
  // Estatico de proposito: onda animada aqui so gastaria bateria e CPU de um
  // celular que precisa carregar rapido.
  return (
    <svg
      aria-hidden
      viewBox="0 0 1440 220"
      preserveAspectRatio="none"
      style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 180, opacity: 0.9 }}
    >
      <path d="M0,120 C260,180 520,60 780,105 C1020,146 1240,80 1440,115 L1440,220 L0,220 Z" fill="rgba(255,255,255,0.10)" />
      <path d="M0,150 C240,95 500,185 760,130 C1000,80 1230,160 1440,105 L1440,220 L0,220 Z" fill="rgba(255,255,255,0.16)" />
    </svg>
  )
}

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0]
}

/* ── Estilos ─────────────────────────────────────────────────── */

const estilos = {
  fundo: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    background: 'linear-gradient(165deg, #0284c7 0%, #0ea5e9 42%, #16a34a 100%)',
  } as React.CSSProperties,

  centro: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: 460,
    margin: '0 auto',
    // `env(safe-area-inset-*)` por causa da barra de gestos do iPhone.
    padding: 'max(28px, env(safe-area-inset-top)) 18px max(28px, env(safe-area-inset-bottom))',
    textAlign: 'center',
  } as React.CSSProperties,

  cartao: {
    background: '#ffffff',
    borderRadius: 26,
    padding: '28px 22px',
    textAlign: 'left',
    boxShadow: '0 2px 6px rgba(2,32,71,0.10), 0 24px 60px -24px rgba(2,32,71,0.55)',
  } as React.CSSProperties,

  selo: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 11px',
    borderRadius: 999,
    background: '#e0f2fe',
    color: '#0369a1',
    fontSize: 12.5,
    fontWeight: 800,
    letterSpacing: 0.2,
  } as React.CSSProperties,

  titulo: {
    margin: '14px 0 0',
    fontSize: 'clamp(25px, 6.4vw, 30px)',
    lineHeight: 1.12,
    fontWeight: 900,
    letterSpacing: -0.9,
    color: '#0f172a',
  } as React.CSSProperties,

  subtitulo: {
    margin: '10px 0 22px',
    fontSize: 15.5,
    lineHeight: 1.55,
    color: '#5b6b7f',
  } as React.CSSProperties,

  rotulo: {
    display: 'block',
    marginBottom: 7,
    fontSize: 14,
    fontWeight: 800,
    color: '#334155',
  } as React.CSSProperties,

  campo: {
    width: '100%',
    // 17px e proposital: com menos de 16px o Safari do iPhone da zoom sozinho
    // ao focar o campo e a pessoa perde o botao de vista.
    fontSize: 17,
    fontFamily: 'inherit',
    fontWeight: 600,
    color: '#0f172a',
    padding: '15px 52px 15px 16px',
    borderRadius: 15,
    border: '1.5px solid #cbd5e1',
    background: '#f8fafc',
    transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
  } as React.CSSProperties,

  olho: {
    position: 'absolute',
    top: 4,
    right: 4,
    bottom: 4,
    width: 46,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 12,
    background: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
  } as React.CSSProperties,

  dica: {
    margin: '0 0 16px',
    fontSize: 13.5,
    color: '#64748b',
  } as React.CSSProperties,

  aviso: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-start',
    margin: '0 0 16px',
    padding: '12px 14px',
    borderRadius: 13,
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#b91c1c',
    fontSize: 14.5,
    lineHeight: 1.45,
    fontWeight: 600,
  } as React.CSSProperties,

  botao: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    width: '100%',
    minHeight: 56,
    padding: '16px 20px',
    borderRadius: 17,
    border: 'none',
    fontSize: 17,
    fontFamily: 'inherit',
    fontWeight: 800,
    letterSpacing: -0.2,
    color: '#ffffff',
    textDecoration: 'none',
    cursor: 'pointer',
    background: 'linear-gradient(100deg, #0284c7, #16a34a)',
    boxShadow: '0 14px 30px -14px rgba(2,132,199,0.9)',
  } as React.CSSProperties,

  botaoOcupado: {
    // Alem do `disabled`, o visual precisa dizer que ja esta indo — senao a
    // pessoa acha que nao pegou e fica batendo no botao.
    opacity: 0.72,
    cursor: 'progress',
    boxShadow: 'none',
  } as React.CSSProperties,

  botaoFantasma: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 52,
    borderRadius: 17,
    fontSize: 16,
    fontWeight: 700,
    color: '#334155',
    textDecoration: 'none',
    background: '#f1f5f9',
  } as React.CSSProperties,

  rodape: {
    margin: '20px auto 0',
    maxWidth: 380,
    fontSize: 13,
    lineHeight: 1.6,
    color: 'rgba(255,255,255,0.9)',
    textShadow: '0 1px 8px rgba(2,32,71,0.35)',
  } as React.CSSProperties,

  linkRodape: {
    color: '#ffffff',
    fontWeight: 700,
  } as React.CSSProperties,

  icone: (fundo: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 62,
    height: 62,
    borderRadius: 20,
    background: fundo,
  }),
}
