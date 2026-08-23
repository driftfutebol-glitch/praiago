import { motion } from 'framer-motion'
import { Apple, Play, Clock } from 'lucide-react'
import { LOJAS } from '../dados'

type Loja = 'play' | 'apple'

/**
 * Botao de baixar o app. Enquanto o app nao esta publicado
 * (`LOJAS[app].disponivel === false` ou sem URL para a loja) ele vira um aviso
 * de "em breve" em vez de apontar pra um link vazio.
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
  const linhaDeCima = ativo ? 'Já disponível na' : 'Em breve na'
  const novidadeGooglePlay = ativo && loja === 'play'

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
    border: novidadeGooglePlay
      ? escuro
        ? '1px solid rgba(134,239,172,0.72)'
        : '1px solid rgba(34,197,94,0.38)'
      : escuro
        ? '1px solid rgba(255,255,255,0.22)'
        : '1px solid rgba(2,32,71,0.12)',
    background: novidadeGooglePlay
      ? escuro
        ? 'linear-gradient(135deg, rgba(34,197,94,0.30), rgba(14,165,233,0.24))'
        : 'linear-gradient(135deg, #f0fdf4, #eff6ff)'
      : escuro
        ? 'rgba(255,255,255,0.10)'
        : '#ffffff',
    color: escuro ? '#ffffff' : '#0f172a',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    boxShadow: novidadeGooglePlay
      ? escuro
        ? '0 10px 30px -12px rgba(74,222,128,0.72)'
        : '0 10px 28px -12px rgba(34,197,94,0.48)'
      : escuro
        ? 'none'
        : '0 6px 20px -8px rgba(2,32,71,0.25)',
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
      {novidadeGooglePlay && (
        <span
          style={{
            marginLeft: 2,
            padding: '5px 8px',
            borderRadius: 999,
            background: escuro ? 'rgba(134,239,172,0.20)' : '#dcfce7',
            color: escuro ? '#bbf7d0' : '#15803d',
            border: escuro ? '1px solid rgba(187,247,208,0.28)' : '1px solid rgba(34,197,94,0.18)',
            fontSize: 9.5,
            fontWeight: 900,
            letterSpacing: 0.65,
            lineHeight: 1,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          Novidade
        </span>
      )}
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
      aria-label={`Baixar o app ${app} na ${nomeLoja} (abre em uma nova aba)`}
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
