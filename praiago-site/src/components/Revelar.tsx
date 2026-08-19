import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

type Direcao = 'baixo' | 'cima' | 'esquerda' | 'direita' | 'zoom'

const DE: Record<Direcao, { x?: number; y?: number; scale?: number }> = {
  baixo: { y: 34 },
  cima: { y: -34 },
  esquerda: { x: -40 },
  direita: { x: 40 },
  zoom: { scale: 0.92 },
}

/**
 * Aparece quando entra na tela. `once` e proposital: reanimar toda vez que o
 * elemento reaparece deixa a rolagem pra cima piscando e cansa.
 */
export default function Revelar({
  children,
  direcao = 'baixo',
  atraso = 0,
  duracao = 0.6,
  className,
  style,
}: {
  children: ReactNode
  direcao?: Direcao
  atraso?: number
  duracao?: number
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, ...DE[direcao] }}
      whileInView={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.25, margin: '0px 0px -80px 0px' }}
      transition={{ duration: duracao, delay: atraso, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}
