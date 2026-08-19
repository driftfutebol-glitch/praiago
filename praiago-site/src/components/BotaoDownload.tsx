import { motion } from 'framer-motion'
import { Apple, Play, Clock } from 'lucide-react'
import { LOJAS } from '../dados'

type Loja = 'play' | 'apple'

/**
 * Botao de baixar o app. Enquanto o app nao esta publicado
 * (`LOJAS[app].disponivel === false`) ele vira um aviso de "em breve" em vez de
 * apontar pra um link vazio — link quebrado em landing page e pior que botao
 * desligado, porque a pessoa clica, nao acontece nada e ela vai embora.
 */
export default function BotaoDownload({
  app,
  loja,
  tema = 'escuro',
}: {
  app: 'cliente' | 'ambulante'
  loja: Loja
  tema?: 'escuro' | 'claro'
}) {
  const cfg = LOJAS[app]
  const href = loja === 'play' ? cfg.play : cfg.apple
  const ativo = cfg.disponivel && !!href

  const nomeLoja = loja === 'play' ? 'Google Play' : 'App Store'
  const linhaDeCima = ativo ? 'Baixar na' : 'Em breve na'

  const escuro = tema === 'escuro'
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 12,
    padding: '13px 22px 13px 18px',
    borderRadius: 16,
    textDecoration: 'none',
    position: 'relative',
    overflow: 'hidden',
    border: escuro ? '1px solid rgba(255,255,255,0.22)' : '1px solid rgba(2,32,71,0.12)',
    background: escuro ? 'rgba(255,255,255,0.10)' : '#ffffff',
    color: escuro ? '#ffffff' : '#0f172a',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    boxShadow: escuro ? 'none' : '0 6px 20px -8px rgba(2,32,71,0.25)',
    cursor: ativo ? 'pointer' : 'default',
    opacity: ativo ? 1 : 0.9,
  }

  const conteudo = (
    <>
      {ativo ? (
        loja === 'play' ? (
          <Play size={26} strokeWidth={1.8} style={{ flexShrink: 0 }} />
        ) : (
          <Apple size={26} strokeWidth={1.8} style={{ flexShrink: 0 }} />
        )
      ) : (
        <Clock size={24} strokeWidth={1.8} style={{ flexShrink: 0, opacity: 0.85 }} />
      )}
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, textAlign: 'left' }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.7, textTransform: 'uppercase', opacity: 0.72 }}>
          {linhaDeCima}
        </span>
        <span style={{ fontSize: 16.5, fontWeight: 800, letterSpacing: -0.2 }}>{nomeLoja}</span>
      </span>
    </>
  )

  if (!ativo) {
    return (
      <div style={base} aria-disabled="true" title={`O app ${app} ainda não foi publicado na ${nomeLoja}`}>
        {conteudo}
      </div>
    )
  }

  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="varredura"
      style={base}
      whileHover={{ y: -3, scale: 1.025 }}
      whileTap={{ scale: 0.975 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
    >
      {conteudo}
    </motion.a>
  )
}
