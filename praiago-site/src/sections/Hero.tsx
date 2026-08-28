import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { ChevronDown, MapPin } from 'lucide-react'
import { faixa } from '../lib/animacao'
import Marca from '../components/Marca'
import Celular from '../components/Celular'
import BotaoDownload from '../components/BotaoDownload'
import { NUMEROS } from '../dados'

export default function Hero() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })

  // Parallax: cada camada sobe numa velocidade diferente enquanto a pessoa
  // rola. E o que da sensacao de profundidade em vez de a tela toda subir junta.
  // Todos com funcao (`faixa`) e nao com par de arrays — ver lib/animacao.ts:
  // com faixa numerica o Framer compila pra WAAPI e a opacidade voltava a subir
  // no fim da secao, deixando o texto do hero fantasma sobre o video.
  const yTexto = useTransform(scrollYProgress, faixa([0, 1], [0, 130]))
  const yCelular = useTransform(scrollYProgress, faixa([0, 1], [0, 240]))
  const yOndaFrente = useTransform(scrollYProgress, faixa([0, 1], [0, -60]))
  const opacidade = useTransform(scrollYProgress, faixa([0, 0.75], [1, 0]))

  return (
    <section
      ref={ref}
      id="topo"
      style={{
        position: 'relative',
        minHeight: '100svh',
        overflow: 'hidden',
        display: 'flex',
        // `flex-start` + `margin-block: auto` no filho (ver CSS abaixo) em vez de
        // `align-items: center`: com centralizacao normal, numa janela mais baixa
        // que o conteudo o hero transborda pros DOIS lados e o topo some atras do
        // cabecalho fixo. Margem automatica centraliza quando sobra espaco e vira
        // zero quando nao sobra — nunca empurra pra cima do cabecalho.
        alignItems: 'flex-start',
        background: 'linear-gradient(168deg, #012a4a 0%, #04629b 34%, #0891b2 64%, #10a37a 100%)',
      }}
    >
      {/* Sol */}
      <motion.div
        initial={{ opacity: 0, y: 70 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.8, ease: 'easeOut' }}
        style={{
          position: 'absolute',
          top: '14%',
          right: '11%',
          width: 340,
          height: 340,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(255,236,180,0.5) 0%, rgba(251,191,36,0.22) 40%, rgba(251,191,36,0) 70%)',
          filter: 'blur(4px)',
          pointerEvents: 'none',
        }}
      />

      {/* Vinheta */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse at 50% 40%, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 48%, rgba(1,20,35,0.42) 100%)',
        }}
      />

      {/* Ondas do rodape, em tres camadas com deriva defasada */}
      <motion.svg
        style={{ y: yOndaFrente, position: 'absolute', bottom: -2, left: 0, width: '100%', height: '26%' }}
        viewBox="0 0 1440 200"
        preserveAspectRatio="none"
        animate={{ x: [0, -28, 0] }}
        transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
      >
        <path
          d="M0,110 C260,170 520,50 780,95 C1020,136 1240,70 1440,105 L1440,200 L0,200 Z"
          fill="rgba(255,255,255,0.09)"
        />
      </motion.svg>
      <motion.svg
        style={{ position: 'absolute', bottom: -2, left: 0, width: '100%', height: '19%' }}
        viewBox="0 0 1440 200"
        preserveAspectRatio="none"
        animate={{ x: [0, 34, 0] }}
        transition={{ duration: 9.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <path
          d="M0,140 C240,85 500,175 760,120 C1000,70 1230,150 1440,95 L1440,200 L0,200 Z"
          fill="rgba(255,255,255,0.16)"
        />
        <path
          d="M0,140 C240,85 500,175 760,120 C1000,70 1230,150 1440,95"
          fill="none"
          stroke="rgba(255,255,255,0.42)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </motion.svg>

      <motion.div
        style={{ opacity: opacidade }}
        className="hero-grade"
      >
        {/* ── Coluna do texto ── */}
        <motion.div style={{ y: yTexto }} className="hero-texto">
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 15px 7px 12px',
              borderRadius: 999,
              marginBottom: 26,
              fontSize: 13,
              fontWeight: 700,
              color: '#ffffff',
            }}
            className="vidro-escuro"
          >
            <span style={{ position: 'relative', display: 'inline-flex', color: '#4ade80' }}>
              <span
                className="ponto-vivo"
                style={{ position: 'relative', width: 8, height: 8, borderRadius: 999, background: '#4ade80' }}
              />
            </span>
            <MapPin size={14} strokeWidth={2.5} />
            Começando pela Baixada Santista
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.2 }}
            style={{ marginBottom: 22 }}
          >
            <Marca
              largura="clamp(215px, 30vw, 320px)"
              filtro="drop-shadow(0 0 2.5px rgba(0,14,10,0.9)) drop-shadow(0 0 10px rgba(0,14,10,0.5)) drop-shadow(0 16px 26px rgba(2,14,9,0.4))"
            />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.3 }}
            style={{
              margin: 0,
              fontSize: 'clamp(34px, 5.6vw, 66px)',
              lineHeight: 1.03,
              fontWeight: 900,
              letterSpacing: -2,
              color: '#ffffff',
              textShadow: '0 4px 34px rgba(0,14,26,0.5)',
            }}
          >
            A praia na palma
            <br />
            da sua mão.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.4 }}
            style={{
              margin: '22px 0 0',
              maxWidth: 520,
              fontSize: 'clamp(16px, 2vw, 20px)',
              lineHeight: 1.55,
              color: 'rgba(255,255,255,0.88)',
              textShadow: '0 2px 16px rgba(0,14,26,0.5)',
            }}
          >
            Comida, bebida e loja entregues no seu guarda-sol. Veja os ambulantes ao vivo no mapa,
            peça pelo app e pague no PIX — sem levantar da areia.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.5 }}
            style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 34 }}
          >
            <BotaoDownload app="cliente" loja="play" />
            <BotaoDownload app="cliente" loja="apple" />
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.75, delay: 0.65 }}
            style={{ margin: '16px 0 0', fontSize: 13.5, color: 'rgba(255,255,255,0.62)' }}
          >
            Vende na praia?{' '}
            <a href="#perfis" style={{ color: '#7dd3fc', fontWeight: 700, textDecoration: 'none' }}>
              Veja como funciona pra ambulante e restaurante ↓
            </a>
          </motion.p>
        </motion.div>

        {/* ── Coluna do celular ── */}
        <motion.div
          style={{ y: yCelular }}
          className="hero-celular"
          initial={{ opacity: 0, x: 60, rotate: 6 }}
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          transition={{ duration: 1, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            animate={{ y: [0, -16, 0], rotate: [-1.6, 1.6, -1.6] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Celular src="/telas/01-inicio.png" alt="Tela inicial do app PraiaGo" largura={300} />
          </motion.div>
        </motion.div>
      </motion.div>

      {/* ── Faixa de fatos ── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.8 }}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 3,
          borderTop: '1px solid rgba(255,255,255,0.14)',
          background: 'rgba(1,20,35,0.34)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
      >
        <div className="hero-fatos">
          {NUMEROS.map((n) => (
            <div key={n.rotulo} style={{ padding: '16px 10px', textAlign: 'center' }}>
              <div
                style={{
                  fontSize: 'clamp(20px, 2.6vw, 28px)',
                  fontWeight: 900,
                  letterSpacing: -0.8,
                  color: '#ffffff',
                  lineHeight: 1.1,
                }}
              >
                {n.valor}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginTop: 3 }}>
                {n.rotulo}
              </div>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.58)', marginTop: 2 }}>{n.detalhe}</div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Seta pra descer */}
      <motion.a
        href="#como-funciona"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, 7, 0] }}
        transition={{ opacity: { delay: 1.2 }, y: { duration: 2, repeat: Infinity, ease: 'easeInOut' } }}
        aria-label="Ver como funciona"
        className="hero-seta"
        style={{
          position: 'absolute',
          bottom: 120,
          left: '50%',
          marginLeft: -21,
          zIndex: 4,
          width: 42,
          height: 42,
          borderRadius: 999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          border: '1px solid rgba(255,255,255,0.28)',
          background: 'rgba(255,255,255,0.12)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <ChevronDown size={20} strokeWidth={2.4} />
      </motion.a>

      <style>{`
        .hero-grade {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 1200px;
          margin: auto;
          padding: 130px 24px 190px;
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          align-items: center;
          gap: 40px;
        }
        .hero-celular { display: flex; justify-content: center; }
        .hero-fatos {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 16px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
        }
        @media (max-width: 900px) {
          .hero-grade {
            grid-template-columns: 1fr;
            padding: 110px 24px 210px;
            text-align: center;
            justify-items: center;
          }
          .hero-texto { display: flex; flex-direction: column; align-items: center; }
          .hero-texto p { margin-left: auto; margin-right: auto; }
          .hero-celular { margin-top: 12px; }
          /* !important porque o proprio elemento traz display:flex no atributo
             style — sem isso o media query nao ganha e a seta fica em cima da
             faixa de fatos no celular. */
          .hero-seta { display: none !important; }
        }
        @media (max-width: 640px) {
          .hero-fatos { grid-template-columns: repeat(2, 1fr); }
          .hero-celular { display: none; }
        }
      `}</style>
    </section>
  )
}
