import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

// Abertura do app, no estilo iFood: toca uma vez por sessao e sai sozinha.
// 100% vetorial/CSS (sem video) — nao depende de rede nem decode de midia,
// entao nao existe cenario de "travar carregando": o primeiro frame ja e o
// frame final. Regras que valem mais que o efeito visual:
//  * NUNCA prender a entrada — timer fixo, sem espera de asset externo;
//  * qualquer toque pula.
//
// Design: menos e melhor. Versoes anteriores tinham sol, raios de luz e
// particulas; com a marca no centro isso virava poluicao e competia com ela.
// Ficou so o que constroi profundidade de verdade: gradiente de mar, a marca
// entrando em 3D e a sombra dela no chao.
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
        // etc. usam ate 100000) — a intro tem que cobrir a tela inteira.
        position: 'fixed', inset: 0, zIndex: 999999, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(170deg, #012a4a 0%, #04629b 38%, #0891b2 68%, #10a37a 100%)',
      }}
    >
      {/* Vinheta: escurece as bordas e empurra o olho pro centro. Faz o
          trabalho que o "sol" fazia, sem desenhar uma bola na tela. */}
      <div
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 50% 42%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 45%, rgba(1,20,35,0.35) 100%)',
        }}
      />

      {/* Mar no rodape: duas curvas com deriva lenta e defasada — uma sobe
          enquanto a outra desce, e e essa diferenca que da sensacao de agua. */}
      <motion.svg
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: [0, -5, 0], opacity: 1 }}
        transition={{ opacity: { duration: 0.7, delay: 0.25 }, y: { duration: 6, repeat: Infinity, ease: 'easeInOut' } }}
        viewBox="0 0 1440 200" preserveAspectRatio="none"
        style={{ position: 'absolute', bottom: -2, left: 0, width: '100%', height: '22%' }}
      >
        <path d="M0,110 C260,170 520,50 780,95 C1020,136 1240,70 1440,105 L1440,200 L0,200 Z" fill="rgba(255,255,255,0.10)" />
      </motion.svg>
      <motion.svg
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: [0, 6, 0], opacity: 1 }}
        transition={{ opacity: { duration: 0.7, delay: 0.4 }, y: { duration: 4.6, repeat: Infinity, ease: 'easeInOut' } }}
        viewBox="0 0 1440 200" preserveAspectRatio="none"
        style={{ position: 'absolute', bottom: -2, left: 0, width: '100%', height: '16%' }}
      >
        <path d="M0,140 C240,85 500,175 760,120 C1000,70 1230,150 1440,95 L1440,200 L0,200 Z" fill="rgba(255,255,255,0.2)" />
        {/* Linha de espuma na crista: detalhe pequeno que faz a onda parecer
            desenhada a mao em vez de uma forma solida. */}
        <path d="M0,140 C240,85 500,175 760,120 C1000,70 1230,150 1440,95" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" />
      </motion.svg>

      {/* Marca em espaco 3D real: "voa" de longe ate encaixar no lugar */}
      <div style={{ perspective: 1400, position: 'relative' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.55, rotateX: 48, rotateY: -22, z: -260 }}
          animate={{ opacity: 1, scale: 1, rotateX: 0, rotateY: 0, z: 0 }}
          transition={{ type: 'spring', stiffness: 140, damping: 17, mass: 0.9 }}
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* Depois que aterrissa, flutua/inclina bem de leve (efeito 3D continuo) */}
          <motion.div
            animate={{ y: [0, -7, 0], rotateX: [0, 2.5, 0, -1.5, 0], rotateY: [0, -3, 0, 2.5, 0] }}
            transition={{ delay: 0.65, duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}
          >
            {/* Recorte da logo (mesma proporcao usada no cabecalho: 140x59) */}
            <div style={{ position: 'relative', width: 'clamp(230px, 66vw, 330px)', aspectRatio: '140 / 59' }}>
              {/* Sombra de contato no "chao": reforca a profundidade sem por
                  nenhuma forma clara atras da marca. */}
              <motion.div
                initial={{ opacity: 0, scaleX: 0.7 }}
                animate={{ opacity: 0.45, scaleX: [0.88, 1, 0.88] }}
                transition={{ opacity: { duration: 0.5, delay: 0.55 }, scaleX: { delay: 0.65, duration: 5.5, repeat: Infinity, ease: 'easeInOut' } }}
                style={{
                  position: 'absolute', left: '20%', width: '60%', bottom: '-13%', height: '14%',
                  borderRadius: '50%',
                  background: 'radial-gradient(ellipse, rgba(1,14,10,0.5) 0%, rgba(1,14,10,0) 72%)',
                  filter: 'blur(4px)',
                }}
              />

              <div
                aria-label="PraiaGo"
                style={{
                  position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
                  // Contorno escuro colado na silhueta das letras (drop-shadow
                  // segue o alpha do PNG). E o que da contraste — a logo tem
                  // gradiente azul->verde igual ao fundo e sumiria sem isso.
                  filter: 'drop-shadow(0 0 2.5px rgba(0,14,10,0.95)) drop-shadow(0 0 3px rgba(0,14,10,0.9)) drop-shadow(0 0 10px rgba(0,14,10,0.6)) drop-shadow(0 20px 26px rgba(2,14,9,0.45))',
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
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.5 }}
              style={{
                fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.95)',
                letterSpacing: 4, textTransform: 'uppercase', textAlign: 'center',
                textShadow: '0 2px 10px rgba(0,18,12,0.55)',
              }}
            >
              Praia na sua mão
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
