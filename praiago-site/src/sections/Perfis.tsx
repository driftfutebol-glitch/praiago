import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ExternalLink } from 'lucide-react'
import Revelar from '../components/Revelar'
import Celular from '../components/Celular'
import Navegador from '../components/Navegador'
import BotaoDownload from '../components/BotaoDownload'
import { PERFIS, PAINEL_RESTAURANTE } from '../dados'

// Cliente e ambulante usam app de celular, entao levam print de celular.
// O restaurante NAO tem app: e um site de gestao que abre no navegador — por
// isso ele ganha moldura de navegador, nao de aparelho. Por um tempo essa
// secao mostrava a tela de eventos do app cliente aqui, o que passava
// exatamente a ideia errada.
const TELA_DO_PERFIL: Record<string, string> = {
  cliente: '/telas/02-todas-categorias.png',
  ambulante: '/telas/03-radar-ambulantes.png',
}

export default function Perfis() {
  const [ativo, setAtivo] = useState(0)
  const perfil = PERFIS[ativo]

  return (
    // `overflow: hidden` porque o brilho atras do mockup usa inset negativo e
    // vazava ~84px pra fora da tela, criando rolagem horizontal na pagina toda.
    <section id="perfis" style={{ position: 'relative', overflow: 'hidden', padding: '110px 0 120px', background: '#ffffff' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
        <Revelar>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: '#0ea5e9' }}>
            Pra quem é
          </p>
          <h2
            style={{
              margin: '14px 0 0',
              fontSize: 'clamp(30px, 4.6vw, 52px)',
              lineHeight: 1.06,
              fontWeight: 900,
              letterSpacing: -1.6,
              color: '#0f172a',
              maxWidth: 720,
            }}
          >
            Três lados da mesma praia,{' '}
            <span className="texto-gradiente">cada um com o seu app</span>.
          </h2>
          <p style={{ margin: '18px 0 0', maxWidth: 620, fontSize: 17.5, lineHeight: 1.6, color: '#475569' }}>
            Quem pede, quem vende andando na areia e quem tem cozinha. Escolha o seu lado pra ver
            exatamente como funciona.
          </p>
        </Revelar>

        {/* Abas */}
        <Revelar atraso={0.1}>
          <div className="perfis-abas">
            {PERFIS.map((p, i) => {
              const selecionado = i === ativo
              return (
                <button
                  key={p.id}
                  onClick={() => setAtivo(i)}
                  aria-pressed={selecionado}
                  style={{
                    position: 'relative',
                    flex: '1 1 210px',
                    padding: '18px 20px',
                    borderRadius: 18,
                    border: `1.5px solid ${selecionado ? p.cor : 'rgba(2,32,71,0.10)'}`,
                    background: selecionado ? p.corClara : '#ffffff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'border-color 0.25s ease, background 0.25s ease, transform 0.2s ease',
                    boxShadow: selecionado
                      ? `0 12px 30px -14px ${p.cor}aa`
                      : '0 2px 10px -6px rgba(2,32,71,0.18)',
                  }}
                >
                  <span style={{ fontSize: 26, display: 'block', marginBottom: 8, lineHeight: 1 }}>{p.emoji}</span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 16.5,
                      fontWeight: 800,
                      letterSpacing: -0.4,
                      color: selecionado ? '#0f172a' : '#334155',
                    }}
                  >
                    {p.nome}
                  </span>
                  <span style={{ display: 'block', marginTop: 4, fontSize: 13.5, color: '#64748b' }}>
                    {p.chamada}
                  </span>
                </button>
              )
            })}
          </div>
        </Revelar>

        {/* Conteudo do perfil selecionado. A moldura de navegador do
            restaurante e bem mais larga que um celular, entao esse perfil
            recebe uma coluna maior pra ela caber legivel. */}
        <div className={`perfis-conteudo${perfil.id === 'restaurante' ? ' largo' : ''}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={perfil.id}
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
              style={{ display: 'contents' }}
            >
              {/* Passos */}
              <div>
                <p style={{ margin: '0 0 30px', fontSize: 18, lineHeight: 1.6, color: '#334155', maxWidth: 560 }}>
                  {perfil.resumo}
                </p>

                <ol style={{ listStyle: 'none', margin: 0, padding: 0, position: 'relative' }}>
                  {/* Linha vertical ligando os passos */}
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: 21,
                      top: 34,
                      bottom: 34,
                      width: 2,
                      background: `linear-gradient(${perfil.cor}, ${perfil.cor}22)`,
                      borderRadius: 999,
                    }}
                  />
                  {perfil.passos.map((passo, i) => (
                    <motion.li
                      key={passo.titulo}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.08 + i * 0.08, duration: 0.45 }}
                      style={{ position: 'relative', display: 'flex', gap: 18, paddingBottom: 26 }}
                    >
                      <span
                        style={{
                          position: 'relative',
                          zIndex: 1,
                          flexShrink: 0,
                          width: 44,
                          height: 44,
                          borderRadius: 14,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 16,
                          fontWeight: 900,
                          color: '#ffffff',
                          background: perfil.cor,
                          boxShadow: `0 8px 20px -8px ${perfil.cor}`,
                        }}
                      >
                        {i + 1}
                      </span>
                      <span style={{ paddingTop: 2 }}>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 18,
                            fontWeight: 800,
                            letterSpacing: -0.4,
                            color: '#0f172a',
                          }}
                        >
                          {passo.titulo}
                        </span>
                        <span style={{ display: 'block', marginTop: 6, fontSize: 15.5, lineHeight: 1.6, color: '#5b6b7f' }}>
                          {passo.texto}
                        </span>
                      </span>
                    </motion.li>
                  ))}
                </ol>

                {/* Acao do perfil */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
                  {perfil.acao.tipo === 'download' ? (
                    <>
                      <BotaoDownload app={perfil.id === 'ambulante' ? 'ambulante' : 'cliente'} loja="play" tema="claro" />
                      <BotaoDownload app={perfil.id === 'ambulante' ? 'ambulante' : 'cliente'} loja="apple" tema="claro" />
                    </>
                  ) : (
                    <motion.a
                      href={PAINEL_RESTAURANTE}
                      target="_blank"
                      rel="noopener noreferrer"
                      whileHover={{ y: -3, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="varredura"
                      style={{
                        position: 'relative',
                        overflow: 'hidden',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '15px 26px',
                        borderRadius: 16,
                        fontSize: 16,
                        fontWeight: 800,
                        color: '#ffffff',
                        textDecoration: 'none',
                        background: `linear-gradient(100deg, ${perfil.cor}, #f97316)`,
                        boxShadow: `0 12px 28px -12px ${perfil.cor}`,
                      }}
                    >
                      {perfil.acao.texto}
                      <ExternalLink size={17} strokeWidth={2.5} />
                    </motion.a>
                  )}
                </div>

                {perfil.id === 'restaurante' && (
                  <p style={{ margin: '14px 0 0', fontSize: 13.5, color: '#64748b' }}>
                    Roda no navegador — não precisa instalar nada no computador do caixa.
                  </p>
                )}
              </div>

              {/* Ilustracao */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', minWidth: 0 }}>
                <motion.div
                  animate={{ y: [0, -14, 0] }}
                  transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}
                >
                  {/* Brilho colorido atras, na cor do perfil */}
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: '-14% -12%',
                      borderRadius: '50%',
                      background: `radial-gradient(ellipse, ${perfil.cor}33 0%, ${perfil.cor}00 68%)`,
                      filter: 'blur(18px)',
                    }}
                  />
                  {perfil.id === 'restaurante' ? (
                    <Navegador larguraMax={620} />
                  ) : (
                    <Celular src={TELA_DO_PERFIL[perfil.id]} alt={`App PraiaGo — ${perfil.nome}`} largura={286} />
                  )}
                </motion.div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Atalho pro proximo perfil */}
        <Revelar>
          <button
            onClick={() => setAtivo((ativo + 1) % PERFIS.length)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 50,
              padding: '12px 20px',
              borderRadius: 999,
              border: '1.5px solid rgba(2,32,71,0.12)',
              background: '#ffffff',
              fontSize: 14.5,
              fontWeight: 700,
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            Ver {PERFIS[(ativo + 1) % PERFIS.length].nome.toLowerCase()}
            <ArrowRight size={16} strokeWidth={2.5} />
          </button>
        </Revelar>
      </div>

      <style>{`
        .perfis-abas {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 44px;
        }
        .perfis-conteudo {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 56px;
          align-items: start;
          margin-top: 52px;
        }
        .perfis-conteudo.largo { grid-template-columns: 0.95fr 1.05fr; gap: 44px; }
        @media (max-width: 1000px) {
          .perfis-conteudo,
          .perfis-conteudo.largo { grid-template-columns: 1fr; gap: 44px; }
        }
      `}</style>
    </section>
  )
}
