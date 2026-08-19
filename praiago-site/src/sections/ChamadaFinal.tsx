import { motion } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import Marca from '../components/Marca'
import BotaoDownload from '../components/BotaoDownload'
import Revelar from '../components/Revelar'
import { PAINEL_RESTAURANTE } from '../dados'

export default function ChamadaFinal() {
  return (
    <section
      id="baixar"
      style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '120px 0 130px',
        background: 'linear-gradient(168deg, #012a4a 0%, #04629b 36%, #0891b2 68%, #10a37a 100%)',
      }}
    >
      {/* Ondas de fundo */}
      <motion.svg
        viewBox="0 0 1440 200"
        preserveAspectRatio="none"
        animate={{ x: [0, -30, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', bottom: -2, left: 0, width: '100%', height: '32%' }}
      >
        <path
          d="M0,110 C260,170 520,50 780,95 C1020,136 1240,70 1440,105 L1440,200 L0,200 Z"
          fill="rgba(255,255,255,0.08)"
        />
      </motion.svg>
      <motion.svg
        viewBox="0 0 1440 200"
        preserveAspectRatio="none"
        animate={{ x: [0, 30, 0] }}
        transition={{ duration: 8.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', bottom: -2, left: 0, width: '100%', height: '22%' }}
      >
        <path
          d="M0,140 C240,85 500,175 760,120 C1000,70 1230,150 1440,95 L1440,200 L0,200 Z"
          fill="rgba(255,255,255,0.14)"
        />
      </motion.svg>

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 880, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
        <Revelar direcao="zoom">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 26 }}>
            <Marca
              largura="clamp(190px, 26vw, 260px)"
              filtro="drop-shadow(0 0 2.5px rgba(0,14,10,0.9)) drop-shadow(0 0 10px rgba(0,14,10,0.5)) drop-shadow(0 16px 26px rgba(2,14,9,0.4))"
            />
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: 'clamp(30px, 5vw, 56px)',
              lineHeight: 1.04,
              fontWeight: 900,
              letterSpacing: -1.8,
              color: '#ffffff',
              textShadow: '0 4px 30px rgba(0,14,26,0.5)',
            }}
          >
            Da próxima vez que você
            <br />
            for na praia, leve o PraiaGo.
          </h2>

          <p
            style={{
              margin: '20px auto 0',
              maxWidth: 540,
              fontSize: 'clamp(16px, 2vw, 19px)',
              lineHeight: 1.55,
              color: 'rgba(255,255,255,0.86)',
            }}
          >
            É de graça pra baixar e pra usar. Quem vende começa sem mensalidade e sem taxa de adesão.
          </p>
        </Revelar>

        <Revelar atraso={0.12}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 12,
              marginTop: 38,
            }}
          >
            <BotaoDownload app="cliente" loja="play" />
            <BotaoDownload app="cliente" loja="apple" />
          </div>

          <div
            style={{
              marginTop: 34,
              paddingTop: 30,
              borderTop: '1px solid rgba(255,255,255,0.16)',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.78)' }}>
              Vende na praia?
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
              <BotaoDownload app="ambulante" loja="play" />
              <motion.a
                href={PAINEL_RESTAURANTE}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ y: -3, scale: 1.025 }}
                whileTap={{ scale: 0.975 }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '13px 22px',
                  borderRadius: 16,
                  fontSize: 15.5,
                  fontWeight: 800,
                  color: '#04374f',
                  textDecoration: 'none',
                  background: '#ffffff',
                  boxShadow: '0 12px 28px -14px rgba(0,0,0,0.7)',
                }}
              >
                Painel do restaurante
                <ExternalLink size={16} strokeWidth={2.5} />
              </motion.a>
            </div>
          </div>
        </Revelar>
      </div>
    </section>
  )
}
