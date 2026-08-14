import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

const DURACAO_MS = 1900
const DURACAO_SAIDA_MS = 300

export default function IntroSplash({ onFim }: { onFim: () => void }) {
  const [saindo, setSaindo] = useState(false)
  const encerrado = useRef(false)
  const timerSaida = useRef<number | null>(null)

  const encerrar = useCallback(() => {
    if (encerrado.current) return
    encerrado.current = true
    setSaindo(true)
    timerSaida.current = window.setTimeout(onFim, DURACAO_SAIDA_MS)
  }, [onFim])

  useEffect(() => {
    const timer = window.setTimeout(encerrar, DURACAO_MS)
    return () => {
      window.clearTimeout(timer)
      if (timerSaida.current !== null) window.clearTimeout(timerSaida.current)
    }
  }, [encerrar])

  return (
    <motion.div
      onPointerDown={encerrar}
      initial={{ opacity: 1 }}
      animate={{ opacity: saindo ? 0 : 1 }}
      transition={{ duration: DURACAO_SAIDA_MS / 1000, ease: 'easeOut' }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(160deg, #022c4a 0%, #047aa2 52%, #0aa57b 100%)',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 42%, rgba(255,255,255,0.13), rgba(255,255,255,0) 48%, rgba(1,20,35,0.32))',
          pointerEvents: 'none',
        }}
      />

      <svg
        aria-hidden="true"
        viewBox="0 0 1440 200"
        preserveAspectRatio="none"
        style={{ position: 'absolute', left: 0, bottom: -2, width: '100%', height: '20%', display: 'block' }}
      >
        <path d="M0,112 C260,172 520,52 780,96 C1020,138 1240,72 1440,106 L1440,200 L0,200 Z" fill="rgba(255,255,255,0.11)" />
        <path d="M0,142 C240,88 500,176 760,122 C1000,72 1230,152 1440,98 L1440,200 L0,200 Z" fill="rgba(255,255,255,0.20)" />
        <path d="M0,142 C240,88 500,176 760,122 C1000,72 1230,152 1440,98" fill="none" stroke="rgba(255,255,255,0.48)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>

      <motion.div
        initial={{ opacity: 0, scale: 0.86, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.56, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
          width: 'min(78vw, 350px)',
          willChange: 'transform, opacity',
          backfaceVisibility: 'hidden',
        }}
      >
        <img
          src="/praiago-logo-intro-v1.webp"
          alt="PraiaGo"
          draggable={false}
          width={720}
          height={318}
          style={{
            display: 'block',
            width: '100%',
            height: 'auto',
            filter: 'drop-shadow(0 14px 24px rgba(1,20,35,0.42))',
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.38, ease: 'easeOut' }}
          style={{
            padding: '0 16px',
            color: 'rgba(255,255,255,0.96)',
            fontSize: 11.5,
            fontWeight: 750,
            letterSpacing: 0,
            textAlign: 'center',
            textShadow: '0 2px 10px rgba(0,18,12,0.55)',
            textTransform: 'uppercase',
          }}
        >
          A Praia na palma da sua mão
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
