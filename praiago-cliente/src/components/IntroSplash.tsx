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

// Particulas ambiente (bolhas subindo). Formula fixa em vez de Math.random
// pra nao "pular" de posicao a cada re-render.
const PARTICULAS = Array.from({ length: 16 }).map((_, i) => ({
  esquerda: (i * 47) % 100,
  tamanho: 3 + (i % 4) * 2,
  duracao: 4.5 + (i % 5) * 0.9,
  atraso: (i % 8) * 0.28,
  deriva: (i % 2 === 0 ? 1 : -1) * (8 + (i % 3) * 7),
}))

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
        // etc. usam ate 100000) — a intro tem que cobrir a tela inteira.
        position: 'fixed', inset: 0, zIndex: 999999, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(160deg, #012a4a 0%, #036fa3 32%, #0891b2 55%, #0d9c6f 78%, #16a34a 100%)',
      }}
    >
      {/* Grao sutil — tira a cara de gradiente 100% liso/digital */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.05, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
        <filter id="graoIntro">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#graoIntro)" />
      </svg>

      {/* Blobs de luz coloridos dando profundidade atmosferica (bem sutis) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5, x: [0, 26, 0], y: [0, -18, 0], scale: [1, 1.08, 1] }}
        transition={{ opacity: { duration: 1 }, x: { duration: 9, repeat: Infinity, ease: 'easeInOut' }, y: { duration: 7, repeat: Infinity, ease: 'easeInOut' }, scale: { duration: 8, repeat: Infinity, ease: 'easeInOut' } }}
        style={{ position: 'absolute', top: '-8%', right: '-10%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,214,140,0.55) 0%, rgba(255,214,140,0) 70%)', filter: 'blur(50px)', mixBlendMode: 'screen' }}
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5, x: [0, -22, 0], y: [0, 20, 0], scale: [1, 1.1, 1] }}
        transition={{ opacity: { duration: 1, delay: 0.15 }, x: { duration: 10, repeat: Infinity, ease: 'easeInOut' }, y: { duration: 8.5, repeat: Infinity, ease: 'easeInOut' }, scale: { duration: 9, repeat: Infinity, ease: 'easeInOut' } }}
        style={{ position: 'absolute', bottom: '-10%', left: '-12%', width: 340, height: 340, borderRadius: '50%', background: 'radial-gradient(circle, rgba(140,255,224,0.4) 0%, rgba(140,255,224,0) 70%)', filter: 'blur(55px)', mixBlendMode: 'screen' }}
      />

      {/* Sol com brilho pulsante */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 0.5, scale: [0.6, 1, 0.94, 1] }}
        transition={{ opacity: { duration: 0.8 }, scale: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } }}
        style={{
          // Sem `transform` aqui (framer-motion ja anima `scale` e sobrescreveria
          // um translate manual) — centraliza com calc() em vez de transform.
          position: 'absolute', top: '12%', left: 'calc(50% - 130px)', width: 260, height: 260,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,247,214,0.9) 0%, rgba(255,247,214,0.25) 55%, rgba(255,247,214,0) 75%)',
          filter: 'blur(2px)',
        }}
      />

      {/* Raios de luz atras da logo, girando bem devagar */}
      <motion.svg
        initial={{ opacity: 0, rotate: -6 }}
        animate={{ opacity: 0.4, rotate: 6 }}
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
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        ))}
      </motion.svg>

      {/* Particulas ambiente subindo, tipo bolha/luz na agua */}
      {PARTICULAS.map((p, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: '10%' }}
          animate={{ opacity: [0, 0.7, 0], y: '-115%', x: [0, p.deriva, 0] }}
          transition={{ delay: p.atraso, duration: p.duracao, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute', bottom: 0, left: `${p.esquerda}%`,
            width: p.tamanho, height: p.tamanho, borderRadius: '50%',
            background: 'rgba(255,255,255,0.8)', filter: 'blur(0.5px)',
          }}
        />
      ))}

      {/* Ondas no rodape, com deriva suave (parallax) */}
      <motion.svg
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: [0, -6, 0], opacity: 1 }}
        transition={{ opacity: { duration: 0.6, delay: 0.2 }, y: { duration: 5, repeat: Infinity, ease: 'easeInOut' } }}
        viewBox="0 0 1440 220" preserveAspectRatio="none"
        style={{ position: 'absolute', bottom: -4, left: 0, width: '100%', height: '26%' }}
      >
        <path d="M0,120 C240,180 480,40 720,90 C960,140 1200,60 1440,110 L1440,220 L0,220 Z" fill="rgba(255,255,255,0.14)" />
      </motion.svg>
      <motion.svg
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: [0, 8, 0], opacity: 1 }}
        transition={{ opacity: { duration: 0.6, delay: 0.35 }, y: { duration: 4.2, repeat: Infinity, ease: 'easeInOut' } }}
        viewBox="0 0 1440 220" preserveAspectRatio="none"
        style={{ position: 'absolute', bottom: -4, left: 0, width: '100%', height: '20%' }}
      >
        <path d="M0,150 C220,90 460,190 720,130 C980,70 1220,160 1440,100 L1440,220 L0,220 Z" fill="rgba(255,255,255,0.24)" />
        <path d="M0,150 C220,90 460,190 720,130 C980,70 1220,160 1440,100" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2.5" strokeLinecap="round" />
      </motion.svg>

      {/* Marca em espaco 3D real: "voa" de longe ate encaixar no lugar */}
      <div style={{ perspective: 1400, position: 'relative' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.5, rotateX: 55, rotateY: -26, z: -300 }}
          animate={{ opacity: 1, scale: 1, rotateX: 0, rotateY: 0, z: 0 }}
          transition={{ type: 'spring', stiffness: 150, damping: 16, mass: 0.9 }}
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* Depois que aterrissa, flutua/inclina bem de leve (efeito 3D continuo) */}
          <motion.div
            animate={{ y: [0, -8, 0], rotateX: [0, 3, 0, -2, 0], rotateY: [0, -4, 0, 3, 0] }}
            transition={{ delay: 0.6, duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}
          >
            {/* Recorte da logo (mesma proporcao usada no cabecalho: 140x59) */}
            <div style={{ position: 'relative', width: 'clamp(220px, 62vw, 320px)', aspectRatio: '140 / 59' }}>
              {/* Sombra de contato no "chao" — reforca a profundidade 3D sem
                  ser um brilho atras da logo (a marca flutua, a sombra fica embaixo) */}
              <motion.div
                initial={{ opacity: 0, scaleX: 0.7 }}
                animate={{ opacity: 0.5, scaleX: [0.85, 1, 0.85] }}
                transition={{ opacity: { duration: 0.4, delay: 0.5 }, scaleX: { delay: 0.6, duration: 5, repeat: Infinity, ease: 'easeInOut' } }}
                style={{
                  position: 'absolute', left: '18%', width: '64%', bottom: '-14%', height: '16%',
                  borderRadius: '50%',
                  background: 'radial-gradient(ellipse, rgba(1,10,8,0.55) 0%, rgba(1,10,8,0) 72%)',
                  filter: 'blur(3px)',
                }}
              />

              <div
                aria-label="PraiaGo"
                style={{
                  position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
                  // Contorno escuro colado na silhueta das letras (drop-shadow
                  // segue o alpha do PNG) — da contraste sem nenhuma bolha atras.
                  filter: 'drop-shadow(0 0 2.5px rgba(0,14,10,0.95)) drop-shadow(0 0 3px rgba(0,14,10,0.9)) drop-shadow(0 0 10px rgba(0,14,10,0.65)) drop-shadow(0 22px 28px rgba(2,14,9,0.45))',
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
                fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.95)',
                letterSpacing: 2.5, textTransform: 'uppercase', textAlign: 'center',
                textShadow: '0 2px 8px rgba(0,18,12,0.5)',
              }}
            >
              Praia Grande na palma da mão
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
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
