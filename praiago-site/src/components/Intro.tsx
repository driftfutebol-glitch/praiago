import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Marca from './Marca'

// Abertura do site. Mesma linguagem visual da intro do app cliente
// (praiago-cliente/src/components/IntroSplash.tsx): gradiente de mar, ondas em
// deriva e a marca entrando em perspectiva 3D. Aqui e uma tela grande, entao
// cabe mais coisa — sol, brilho na agua e a saida em "cortina" que sobe.
//
// Regras que valem mais que o efeito:
//   * NUNCA prender a entrada — timer fixo, nada de esperar asset carregar;
//   * clique/tecla em qualquer lugar pula;
//   * toca 1x por sessao (reabrir aba nao repete).

const CHAVE_SESSAO = 'praiago_site_intro'
const DURACAO_MS = 2600

export function deveMostrarIntro() {
  try {
    if (sessionStorage.getItem(CHAVE_SESSAO)) return false
    sessionStorage.setItem(CHAVE_SESSAO, '1')
    return true
  } catch {
    return false // navegador sem sessionStorage: melhor entrar direto
  }
}

// Bolhas geradas por formula fixa, NAO por Math.random(): com random elas
// pulam de lugar a cada re-render do React.
const BOLHAS = Array.from({ length: 18 }, (_, i) => ({
  esquerda: (i * 37) % 100,
  tamanho: 4 + ((i * 13) % 12),
  atraso: (i % 9) * 0.34,
  duracao: 5 + ((i * 7) % 5),
}))

export default function Intro({ onFim }: { onFim: () => void }) {
  const [saindo, setSaindo] = useState(false)

  useEffect(() => {
    document.body.classList.add('intro-aberta')
    return () => document.body.classList.remove('intro-aberta')
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => setSaindo(true), DURACAO_MS)
    const pular = () => setSaindo(true)
    window.addEventListener('keydown', pular)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', pular)
    }
  }, [])

  return (
    <AnimatePresence onExitComplete={onFim}>
      {!saindo && (
        <motion.div
          onClick={() => setSaindo(true)}
          exit={{ opacity: 0, scale: 1.08, filter: 'blur(6px)' }}
          transition={{ duration: 0.65, ease: [0.65, 0, 0.35, 1] }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            background: 'linear-gradient(170deg, #012a4a 0%, #04629b 38%, #0891b2 68%, #10a37a 100%)',
          }}
        >
          {/* Sol baixo no horizonte, subindo devagar */}
          <motion.div
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 1.6, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              bottom: '20%',
              left: '50%',
              marginLeft: -140,
              width: 280,
              height: 280,
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(255,229,160,0.55) 0%, rgba(251,191,36,0.28) 38%, rgba(251,191,36,0) 70%)',
              filter: 'blur(6px)',
            }}
          />

          {/* Vinheta: escurece as bordas e empurra o olho pro centro */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background:
                'radial-gradient(ellipse at 50% 42%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 45%, rgba(1,20,35,0.42) 100%)',
            }}
          />

          {/* Bolhas subindo */}
          {BOLHAS.map((b, i) => (
            <motion.span
              key={i}
              initial={{ y: 0, opacity: 0 }}
              animate={{ y: -560, opacity: [0, 0.5, 0.5, 0] }}
              transition={{
                duration: b.duracao,
                delay: b.atraso,
                repeat: Infinity,
                ease: 'easeOut',
              }}
              style={{
                position: 'absolute',
                bottom: -20,
                left: `${b.esquerda}%`,
                width: b.tamanho,
                height: b.tamanho,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.5)',
                pointerEvents: 'none',
              }}
            />
          ))}

          {/* Mar no rodape: duas curvas com deriva defasada — uma sobe enquanto
              a outra desce, e e essa diferenca que da sensacao de agua. */}
          <motion.svg
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: [0, -6, 0], opacity: 1 }}
            transition={{
              opacity: { duration: 0.7, delay: 0.25 },
              y: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
            }}
            viewBox="0 0 1440 200"
            preserveAspectRatio="none"
            style={{ position: 'absolute', bottom: -2, left: 0, width: '100%', height: '24%' }}
          >
            <path
              d="M0,110 C260,170 520,50 780,95 C1020,136 1240,70 1440,105 L1440,200 L0,200 Z"
              fill="rgba(255,255,255,0.10)"
            />
          </motion.svg>
          <motion.svg
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: [0, 7, 0], opacity: 1 }}
            transition={{
              opacity: { duration: 0.7, delay: 0.4 },
              y: { duration: 4.6, repeat: Infinity, ease: 'easeInOut' },
            }}
            viewBox="0 0 1440 200"
            preserveAspectRatio="none"
            style={{ position: 'absolute', bottom: -2, left: 0, width: '100%', height: '17%' }}
          >
            <path
              d="M0,140 C240,85 500,175 760,120 C1000,70 1230,150 1440,95 L1440,200 L0,200 Z"
              fill="rgba(255,255,255,0.2)"
            />
            {/* Espuma na crista: detalhe pequeno que faz a onda parecer
                desenhada a mao em vez de uma forma solida */}
            <path
              d="M0,140 C240,85 500,175 760,120 C1000,70 1230,150 1440,95"
              fill="none"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </motion.svg>

          {/* Marca em espaco 3D real: "voa" de longe ate encaixar no lugar.
              ⚠️ Framer Motion assume o `transform` inteiro quando anima
              scale/rotate — nao da pra centralizar filho absoluto com
              translate(-50%) aqui dentro; usar offsets fixos. */}
          <div style={{ perspective: 1400, position: 'relative', zIndex: 2 }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.55, rotateX: 48, rotateY: -22, z: -260 }}
              animate={{ opacity: 1, scale: 1, rotateX: 0, rotateY: 0, z: 0 }}
              transition={{ type: 'spring', stiffness: 140, damping: 17, mass: 0.9 }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              {/* Depois que aterrissa, flutua/inclina de leve */}
              <motion.div
                animate={{
                  y: [0, -8, 0],
                  rotateX: [0, 2.5, 0, -1.5, 0],
                  rotateY: [0, -3, 0, 2.5, 0],
                }}
                transition={{ delay: 0.65, duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}
              >
                <div style={{ position: 'relative' }}>
                  {/* Sombra de contato no "chao": profundidade sem por nenhuma
                      forma clara atras da marca */}
                  <motion.div
                    initial={{ opacity: 0, scaleX: 0.7 }}
                    animate={{ opacity: 0.45, scaleX: [0.88, 1, 0.88] }}
                    transition={{
                      opacity: { duration: 0.5, delay: 0.55 },
                      scaleX: { delay: 0.65, duration: 5.5, repeat: Infinity, ease: 'easeInOut' },
                    }}
                    style={{
                      position: 'absolute',
                      left: '20%',
                      width: '60%',
                      bottom: '-13%',
                      height: '14%',
                      borderRadius: '50%',
                      background: 'radial-gradient(ellipse, rgba(1,14,10,0.5) 0%, rgba(1,14,10,0) 72%)',
                      filter: 'blur(4px)',
                    }}
                  />
                  {/* A logo tem gradiente azul->verde igual ao fundo e sumiria
                      sem contorno. drop-shadow segue o alpha do PNG, entao cria
                      um contorno colado na silhueta das letras — nao uma forma
                      geometrica solta atras. */}
                  <Marca
                    largura="clamp(240px, 42vw, 460px)"
                    filtro="drop-shadow(0 0 2.5px rgba(0,14,10,0.95)) drop-shadow(0 0 3px rgba(0,14,10,0.9)) drop-shadow(0 0 12px rgba(0,14,10,0.6)) drop-shadow(0 22px 30px rgba(2,14,9,0.45))"
                  />
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 10, letterSpacing: '0.6em' }}
                  animate={{ opacity: 1, y: 0, letterSpacing: '0.22em' }}
                  transition={{ delay: 0.8, duration: 0.7, ease: 'easeOut' }}
                  style={{
                    fontSize: 'clamp(11px, 1.4vw, 15px)',
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.95)',
                    textTransform: 'uppercase',
                    textAlign: 'center',
                    textShadow: '0 2px 12px rgba(0,18,12,0.6)',
                    padding: '0 20px',
                    maxWidth: '100vw',
                  }}
                >
                  A praia na palma da sua mão
                </motion.div>
              </motion.div>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5, duration: 0.6 }}
            style={{
              position: 'absolute',
              bottom: 28,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontSize: 12,
              fontWeight: 500,
              color: 'rgba(255,255,255,0.6)',
            }}
          >
            clique pra pular
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
