import { motion } from 'framer-motion'
import {
  Radar,
  Zap,
  TicketPercent,
  CalendarDays,
  Wallet,
  MessageCircle,
  Store,
  ShieldCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Revelar from '../components/Revelar'
import { RECURSOS } from '../dados'

const ICONES: Record<string, LucideIcon> = {
  radar: Radar,
  pix: Zap,
  cupom: TicketPercent,
  evento: CalendarDays,
  carteira: Wallet,
  chat: MessageCircle,
  loja: Store,
  escudo: ShieldCheck,
}

export default function Recursos() {
  return (
    <section
      id="recursos"
      style={{
        position: 'relative',
        padding: '110px 0 120px',
        background: 'linear-gradient(180deg, #f8fafc 0%, #eef6fb 55%, #f8fafc 100%)',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
        <Revelar>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: '#22c55e' }}>
            O que tem dentro
          </p>
          <h2
            style={{
              margin: '14px 0 0',
              fontSize: 'clamp(30px, 4.6vw, 52px)',
              lineHeight: 1.06,
              fontWeight: 900,
              letterSpacing: -1.6,
              color: '#0f172a',
              maxWidth: 740,
            }}
          >
            Tudo que a praia precisa,{' '}
            <span className="texto-gradiente">num app só</span>.
          </h2>
        </Revelar>

        <div className="recursos-grade">
          {RECURSOS.map((r, i) => {
            const Icone = ICONES[r.icone] ?? Zap
            return (
              <Revelar key={r.titulo} atraso={(i % 4) * 0.07} direcao="baixo">
                <motion.article
                  whileHover={{ y: -6 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                  style={{
                    height: '100%',
                    padding: '26px 24px 28px',
                    borderRadius: 22,
                    background: '#ffffff',
                    border: '1px solid rgba(2,32,71,0.07)',
                    boxShadow: '0 2px 6px -2px rgba(2,32,71,0.06), 0 14px 34px -20px rgba(2,32,71,0.28)',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 50,
                      height: 50,
                      borderRadius: 15,
                      marginBottom: 18,
                      color: '#ffffff',
                      background: `linear-gradient(140deg, ${r.cor}, ${r.cor}bb)`,
                      boxShadow: `0 10px 24px -12px ${r.cor}`,
                    }}
                  >
                    <Icone size={24} strokeWidth={2.1} />
                  </span>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 18.5,
                      fontWeight: 800,
                      letterSpacing: -0.5,
                      color: '#0f172a',
                    }}
                  >
                    {r.titulo}
                  </h3>
                  <p style={{ margin: '9px 0 0', fontSize: 15, lineHeight: 1.6, color: '#5b6b7f' }}>{r.texto}</p>
                </motion.article>
              </Revelar>
            )
          })}
        </div>
      </div>

      <style>{`
        .recursos-grade {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-top: 52px;
        }
        @media (max-width: 1040px) { .recursos-grade { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 780px)  { .recursos-grade { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 480px)  { .recursos-grade { grid-template-columns: 1fr; } }
      `}</style>
    </section>
  )
}
