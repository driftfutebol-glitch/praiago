import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

// Abertura do app, no estilo iFood: toca uma vez por sessao e sai sozinha.
// Regras que valem mais que o efeito visual:
//  * NUNCA travar a entrada — se o video nao carregar, sai na hora;
//  * sem audio (som ao abrir o app incomoda e o navegador bloqueia autoplay);
//  * qualquer toque pula.
const CHAVE_SESSAO = 'praiago_intro_vista'
const LIMITE_MS = 3200 // rede ruim nao pode prender o cliente na abertura (video: 2,3s)
const AZUL = '#015ec8' // mesmo azul do video — sem isso pisca no primeiro quadro

export default function IntroSplash({ onFim }: { onFim: () => void }) {
  const [saindo, setSaindo] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const encerrado = useRef(false)

  function encerrar() {
    if (encerrado.current) return
    encerrado.current = true
    setSaindo(true)
    window.setTimeout(onFim, 420) // deixa o fade terminar
  }

  useEffect(() => {
    // Trava de seguranca: se o video engasgar, a abertura sai do caminho.
    const limite = window.setTimeout(encerrar, LIMITE_MS)
    const v = videoRef.current
    v?.play().catch(() => encerrar()) // autoplay bloqueado: nao insiste
    return () => window.clearTimeout(limite)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      onClick={encerrar}
      initial={{ opacity: 1 }}
      animate={{ opacity: saindo ? 0 : 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: AZUL,
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}
    >
      <video
        ref={videoRef}
        src="/intro.mp4"
        muted
        playsInline
        autoPlay
        preload="auto"
        onEnded={encerrar}
        onError={encerrar}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
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
