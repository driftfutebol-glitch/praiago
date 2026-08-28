import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus } from 'lucide-react'
import Revelar from '../components/Revelar'
import { FAQ } from '../dados'

export default function Faq() {
  const [aberta, setAberta] = useState<number | null>(0)

  return (
    <section id="duvidas" style={{ padding: '110px 0 120px', background: '#f8fafc' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px' }}>
        <Revelar>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: '#0ea5e9' }}>
            Dúvidas
          </p>
          <h2
            style={{
              margin: '14px 0 0',
              fontSize: 'clamp(30px, 4.6vw, 48px)',
              lineHeight: 1.08,
              fontWeight: 900,
              letterSpacing: -1.4,
              color: '#0f172a',
            }}
          >
            Perguntas que sempre aparecem.
          </h2>
        </Revelar>

        <div style={{ marginTop: 44, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FAQ.map((item, i) => {
            const ativa = aberta === i
            return (
              <Revelar key={item.p} atraso={i * 0.05}>
                <div
                  style={{
                    borderRadius: 18,
                    background: '#ffffff',
                    border: `1px solid ${ativa ? 'rgba(14,165,233,0.35)' : 'rgba(2,32,71,0.08)'}`,
                    boxShadow: ativa
                      ? '0 14px 34px -20px rgba(14,165,233,0.7)'
                      : '0 2px 8px -4px rgba(2,32,71,0.1)',
                    transition: 'border-color 0.25s ease, box-shadow 0.25s ease',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    onClick={() => setAberta(ativa ? null : i)}
                    aria-expanded={ativa}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 18,
                      padding: '20px 22px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 16.5, fontWeight: 700, letterSpacing: -0.3, color: '#0f172a' }}>
                      {item.p}
                    </span>
                    <motion.span
                      animate={{ rotate: ativa ? 45 : 0 }}
                      transition={{ duration: 0.25 }}
                      style={{
                        flexShrink: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        color: ativa ? '#ffffff' : '#0ea5e9',
                        background: ativa ? '#0ea5e9' : 'rgba(14,165,233,0.10)',
                      }}
                    >
                      <Plus size={18} strokeWidth={2.6} />
                    </motion.span>
                  </button>

                  <AnimatePresence initial={false}>
                    {ativa && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        style={{ overflow: 'hidden' }}
                      >
                        <p style={{ margin: 0, padding: '0 22px 22px', fontSize: 15.5, lineHeight: 1.65, color: '#5b6b7f' }}>
                          {item.r}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Revelar>
            )
          })}
        </div>
      </div>
    </section>
  )
}
