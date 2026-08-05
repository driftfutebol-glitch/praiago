import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

// Abertura do app, no estilo iFood: toca uma vez por sessao e sai sozinha.
// 100% vetorial/CSS (sem video) — nao depende de rede nem decode de midia,
// entao nao existe cenario de "travar carregando": o primeiro frame ja e o
// frame final. Regras que valem mais que o efeito visual:
//  * NUNCA prender a entrada — timer fixo, sem espera de asset externo;
//  * qualquer toque pula.
const CHAVE_SESSAO = 'praiago_intro_vista'
const DURACAO_MS = 2100 // tempo de tela antes do fade automatico

export default function IntroSplash({ onFim }: { onFim: () => void }) {
  const [saindo, setSaindo] = useState(false)
  const [encerrado, setEncerrado] = useState(false)

  function encerrar() {
    if (encerrado) return
    setEncerrado(true)
    setSaindo(true)
    window.setTimeout(onFim, 420) // deixa o fade terminar
  }

  useEffect(() => {
    const t = window.setTimeout(encerrar, DURACAO_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      onClick={encerrar}
      initial={{ opacity: 1 }}
      animate={{ opacity: saindo ? 0 : 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      style={{
        // Precisa vencer QUALQUER outro elemento fixo do app (chatbot, dialogs
        // etc. usam ate 9999-12000) — a intro tem que cobrir a tela inteira.
        position: 'fixed', inset: 0, zIndex: 999999, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(160deg, #0369a1 0%, #0ea5e9 40%, #16a34a 100%)',
      }}
    >
      {/* Sol com brilho pulsante */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 0.55, scale: [0.6, 1, 0.94, 1] }}
        transition={{ opacity: { duration: 0.8 }, scale: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } }}
        style={{
          position: 'absolute', top: '14%', left: '50%', width: 260, height: 260,
          borderRadius: '50%', transform: 'translateX(-50%)',
          background: 'radial-gradient(circle, rgba(255,247,214,0.9) 0%, rgba(255,247,214,0.25) 55%, rgba(255,247,214,0) 75%)',
          filter: 'blur(2px)',
        }}
      />

      {/* Raios de luz atras da logo, girando bem devagar */}
      <motion.svg
        initial={{ opacity: 0, rotate: -6 }}
        animate={{ opacity: 0.5, rotate: 6 }}
        transition={{ opacity: { duration: 1 }, rotate: { duration: 7, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' } }}
        width="520" height="520" viewBox="0 0 520 520"
        style={{ position: 'absolute' }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <line
            key={i}
            x1="260" y1="260"
            x2={260 + 250 * Math.cos((i * Math.PI) / 4)}
            y2={260 + 250 * Math.sin((i * Math.PI) / 4)}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        ))}
      </motion.svg>

      {/* Ondas no rodape, com deriva suave (parallax) */}
      <motion.svg
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: [0, -6, 0], opacity: 1 }}
        transition={{ opacity: { duration: 0.6, delay: 0.2 }, y: { duration: 5, repeat: Infinity, ease: 'easeInOut' } }}
        viewBox="0 0 1440 220" preserveAspectRatio="none"
        style={{ position: 'absolute', bottom: -4, left: 0, width: '100%', height: '26%' }}
      >
        <path d="M0,120 C240,180 480,40 720,90 C960,140 1200,60 1440,110 L1440,220 L0,220 Z" fill="rgba(255,255,255,0.16)" />
      </motion.svg>
      <motion.svg
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: [0, 8, 0], opacity: 1 }}
        transition={{ opacity: { duration: 0.6, delay: 0.35 }, y: { duration: 4.2, repeat: Infinity, ease: 'easeInOut' } }}
        viewBox="0 0 1440 220" preserveAspectRatio="none"
        style={{ position: 'absolute', bottom: -4, left: 0, width: '100%', height: '20%' }}
      >
        <path d="M0,150 C220,90 460,190 720,130 C980,70 1220,160 1440,100 L1440,220 L0,220 Z" fill="rgba(255,255,255,0.26)" />
      </motion.svg>

      {/* Marca: pula/aterrissa com mola, depois flutua levemente */}
      <motion.div
        initial={{ scale: 0.3, opacity: 0, rotate: -8, y: 30 }}
        animate={{ scale: 1, opacity: 1, rotate: 0, y: [0, -8, 0] }}
        transition={{
          scale: { type: 'spring', stiffness: 260, damping: 15 },
          opacity: { duration: 0.35 },
          rotate: { type: 'spring', stiffness: 260, damping: 15 },
          y: { delay: 0.55, duration: 2.2, repeat: Infinity, ease: 'easeInOut' },
        }}
        style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}
      >
        {/* Recorte da logo (mesma proporcao usada no cabecalho: 140x59) */}
        <div style={{ position: 'relative', width: 'clamp(220px, 62vw, 320px)', aspectRatio: '140 / 59' }}>
          {/* Halo claro atras da marca: a logo tem gradiente azul->verde e some
              no fundo (que e o mesmo azul->verde) sem um contraste por tras */}
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15, duration: 0.5, ease: 'easeOut' }}
            style={{
              // Nao usar `transform` aqui: o framer-motion assume essa propriedade
              // pra animar `scale` e sobrescreve qualquer translate manual — por
              // isso os offsets de centralizacao sao em top/left, nao em transform.
              position: 'absolute', top: '-80%', left: '-15%', width: '130%', height: '260%',
              borderRadius: '50%',
              background: 'radial-gradient(ellipse, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.55) 55%, rgba(255,255,255,0) 78%)',
              filter: 'blur(4px)',
            }}
          />

          <div
            aria-label="PraiaGo"
            style={{
              position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
              filter: 'drop-shadow(0 18px 30px rgba(4,30,20,0.35))',
            }}
          >
            <img
              src="/praiago-logo-transparent.png"
              alt="PraiaGo"
              draggable={false}
              style={{
                position: 'absolute', width: '165%', height: '391.5%',
                left: '-40%', top: '-113.6%', maxWidth: 'none', display: 'block',
              }}
            />
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75, duration: 0.5 }}
          style={{
            fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.92)',
            letterSpacing: 2.5, textTransform: 'uppercase', textAlign: 'center',
          }}
        >
          Praia Grande na palma da mão
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

/** So mostra a abertura uma vez por sessao — reabrir uma aba nao repete. */
export function deveMostrarIntro() {
  try {
    if (sessionStorage.getItem(CHAVE_SESSAO)) return false
    sessionStorage.setItem(CHAVE_SESSAO, '1')
    return true
  } catch {
    return false // navegador sem sessionStorage: melhor entrar direto
  }
}
