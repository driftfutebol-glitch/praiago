import { useEffect, useState } from 'react'
import { motion, useScroll, useSpring } from 'framer-motion'
import { ExternalLink, Menu, X } from 'lucide-react'
import Marca from '../components/Marca'
import { PAINEL_RESTAURANTE } from '../dados'

const LINKS = [
  { href: '#como-funciona', texto: 'Como funciona' },
  { href: '#perfis', texto: 'Pra quem é' },
  { href: '#eventos', texto: 'Eventos' },
  { href: '#recursos', texto: 'Recursos' },
  { href: '#avaliacoes', texto: 'Avaliações' },
  { href: '#duvidas', texto: 'Dúvidas' },
]

export default function Cabecalho() {
  // O cabecalho so ganha fundo depois que sai do topo — em cima do hero ele
  // fica transparente pra nao cortar a imagem.
  const [descido, setDescido] = useState(false)
  const [menuAberto, setMenuAberto] = useState(false)

  const { scrollYProgress } = useScroll()
  const progresso = useSpring(scrollYProgress, { stiffness: 260, damping: 40, restDelta: 0.001 })

  useEffect(() => {
    const aoRolar = () => setDescido(window.scrollY > 40)
    aoRolar()
    window.addEventListener('scroll', aoRolar, { passive: true })
    return () => window.removeEventListener('scroll', aoRolar)
  }, [])

  // Trava o corpo quando o menu do celular esta aberto
  useEffect(() => {
    document.body.style.overflow = menuAberto ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [menuAberto])

  return (
    <>
      <motion.header
        initial={{ y: -80 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 900,
          transition: 'background 0.35s ease, box-shadow 0.35s ease, backdrop-filter 0.35s ease',
          background: descido ? 'rgba(255,255,255,0.82)' : 'transparent',
          backdropFilter: descido ? 'blur(18px) saturate(1.6)' : 'none',
          WebkitBackdropFilter: descido ? 'blur(18px) saturate(1.6)' : 'none',
          boxShadow: descido ? '0 1px 0 rgba(2,32,71,0.08), 0 8px 30px -18px rgba(2,32,71,0.4)' : 'none',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '0 20px',
            height: 68,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
          }}
        >
          <a href="#topo" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }} aria-label="PraiaGo — início">
            <Marca
              largura={132}
              filtro={
                descido
                  ? undefined
                  : 'drop-shadow(0 1px 2px rgba(0,20,14,0.55)) drop-shadow(0 2px 10px rgba(0,20,14,0.4))'
              }
            />
          </a>

          <nav className="nav-desktop" style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                style={{
                  fontSize: 14.5,
                  fontWeight: 600,
                  textDecoration: 'none',
                  color: descido ? '#334155' : 'rgba(255,255,255,0.94)',
                  textShadow: descido ? 'none' : '0 1px 8px rgba(0,20,14,0.5)',
                  transition: 'color 0.2s ease, opacity 0.2s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.65')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                {l.texto}
              </a>
            ))}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <a
              className="botao-restaurante"
              href={PAINEL_RESTAURANTE}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '10px 17px',
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 700,
                textDecoration: 'none',
                color: '#ffffff',
                background: 'linear-gradient(100deg, #0284c7, #0ea5e9 45%, #22c55e)',
                boxShadow: '0 6px 20px -8px rgba(14,165,233,0.8)',
                whiteSpace: 'nowrap',
              }}
            >
              Sou restaurante
              <ExternalLink size={15} strokeWidth={2.4} />
            </a>

            <button
              className="botao-menu"
              onClick={() => setMenuAberto((v) => !v)}
              aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menuAberto}
              style={{
                display: 'none',
                alignItems: 'center',
                justifyContent: 'center',
                width: 42,
                height: 42,
                borderRadius: 12,
                border: 'none',
                cursor: 'pointer',
                background: descido ? 'rgba(2,32,71,0.06)' : 'rgba(255,255,255,0.16)',
                color: descido ? '#0f172a' : '#ffffff',
                backdropFilter: 'blur(10px)',
              }}
            >
              {menuAberto ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </div>

        {/* Barra fina mostrando o quanto da pagina ja passou */}
        <motion.div
          style={{
            transformOrigin: '0% 50%',
            scaleX: progresso,
            height: 2.5,
            background: 'linear-gradient(90deg, #0ea5e9, #22c55e)',
            opacity: descido ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        />
      </motion.header>

      {/* Menu do celular */}
      {menuAberto && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 890,
            background: 'rgba(255,255,255,0.97)',
            backdropFilter: 'blur(20px)',
            paddingTop: 90,
          }}
          onClick={() => setMenuAberto(false)}
        >
          <nav style={{ display: 'flex', flexDirection: 'column', padding: '0 28px', gap: 4 }}>
            {LINKS.map((l, i) => (
              <motion.a
                key={l.href}
                href={l.href}
                initial={{ opacity: 0, x: -18 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 + i * 0.05 }}
                style={{
                  padding: '17px 0',
                  fontSize: 21,
                  fontWeight: 800,
                  letterSpacing: -0.4,
                  color: '#0f172a',
                  textDecoration: 'none',
                  borderBottom: '1px solid rgba(2,32,71,0.07)',
                }}
              >
                {l.texto}
              </motion.a>
            ))}
          </nav>
        </motion.div>
      )}

      <style>{`
        @media (max-width: 940px) {
          .nav-desktop { display: none !important; }
          .botao-menu { display: inline-flex !important; }
        }
        @media (max-width: 520px) {
          .botao-restaurante { display: none !important; }
        }
      `}</style>
    </>
  )
}
