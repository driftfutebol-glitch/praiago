import { useEffect, useRef, useState } from 'react'
import { motion, useScroll, useTransform, useInView } from 'framer-motion'
import { Ticket, QrCode, MapPin, Share2, ArrowRight } from 'lucide-react'
import Celular from '../components/Celular'
import Revelar from '../components/Revelar'
import { faixa } from '../lib/animacao'

// Seção de destaque dos eventos. É a única seção com fundo escuro no meio das
// claras — de propósito: evento é noite, e o corte de luminosidade sozinho já
// faz o olho parar aqui na rolagem.

// Os mesmos períodos que o app usa pra filtrar (tela "Eventos na Praia").
const PERIODOS = [
  { rotulo: 'Manhã', emoji: '🏊' },
  { rotulo: 'Tarde', emoji: '🌞' },
  { rotulo: 'Noite', emoji: '🌙' },
  { rotulo: 'Madrugada', emoji: '✨' },
]

const PASSOS = [
  { icone: MapPin, titulo: 'Vê o que vai rolar', texto: 'Shows, samba, festa na orla — filtrado por manhã, tarde, noite ou madrugada.' },
  { icone: Ticket, titulo: 'Compra pelo app', texto: 'Preço e lote na tela, pagamento no PIX ou cartão, sem sair pra outro site.' },
  { icone: QrCode, titulo: 'Entra sem fila', texto: 'O ingresso vira QR Code no seu celular. Chegou, mostrou, entrou.' },
]

export default function Eventos() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  // Parallax suave — sempre com `faixa`, nunca par de arrays (ver lib/animacao.ts)
  const yIngresso = useTransform(scrollYProgress, faixa([0, 1], [70, -70]))
  const yCelular = useTransform(scrollYProgress, faixa([0, 1], [30, -30]))

  // O chip aceso vai girando sozinho, imitando a troca de filtro no app.
  const [periodoAceso, setPeriodoAceso] = useState(2) // começa em "Noite"
  useEffect(() => {
    const t = window.setInterval(() => setPeriodoAceso((p) => (p + 1) % PERIODOS.length), 1900)
    return () => window.clearInterval(t)
  }, [])

  return (
    <section
      ref={ref}
      id="eventos"
      style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '110px 0 120px',
        background: 'linear-gradient(165deg, #0b1026 0%, #141a3d 38%, #1d1b4b 66%, #24123f 100%)',
      }}
    >
      {/* Luzes de palco ao fundo */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <motion.div
          animate={{ opacity: [0.5, 0.85, 0.5], scale: [1, 1.12, 1] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute', top: '-14%', left: '6%', width: 520, height: 520, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(168,85,247,0.36) 0%, rgba(168,85,247,0) 68%)',
            filter: 'blur(16px)', mixBlendMode: 'screen',
          }}
        />
        <motion.div
          animate={{ opacity: [0.45, 0.8, 0.45], scale: [1.1, 1, 1.1] }}
          transition={{ duration: 8.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute', bottom: '-18%', right: '2%', width: 560, height: 560, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(14,165,233,0.34) 0%, rgba(14,165,233,0) 68%)',
            filter: 'blur(16px)', mixBlendMode: 'screen',
          }}
        />
      </div>

      <Confetes />

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
        <div className="eventos-grade">
          {/* ── Texto ── */}
          <div>
            <Revelar>
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 15px 7px 12px',
                  borderRadius: 999, marginBottom: 22, fontSize: 12.5, fontWeight: 800,
                  letterSpacing: 0.6, textTransform: 'uppercase', color: '#f0abfc',
                  background: 'rgba(217,70,239,0.14)', border: '1px solid rgba(217,70,239,0.34)',
                }}
              >
                <Ticket size={15} strokeWidth={2.5} />
                Também tem evento
              </span>

              <h2
                style={{
                  margin: 0, fontSize: 'clamp(31px, 4.8vw, 54px)', lineHeight: 1.05,
                  fontWeight: 900, letterSpacing: -1.7, color: '#ffffff',
                }}
              >
                A praia não acaba
                <br />
                <span
                  style={{
                    background: 'linear-gradient(100deg, #22d3ee 0%, #a855f7 55%, #f0abfc 100%)',
                    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                  }}
                >
                  quando o sol se põe
                </span>
                .
              </h2>

              <p style={{ margin: '20px 0 0', maxWidth: 500, fontSize: 17.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.76)' }}>
                O PraiaGo também mostra o que vai rolar na sua praia — e vende o ingresso dentro do
                app. Você não sai pra outro site nem imprime nada.
              </p>
            </Revelar>

            {/* Chips de período, acendendo em sequência */}
            <Revelar atraso={0.1}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 28 }}>
                {PERIODOS.map((p, i) => {
                  const aceso = i === periodoAceso
                  return (
                    <motion.span
                      key={p.rotulo}
                      animate={{ scale: aceso ? 1.06 : 1 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 20 }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        padding: '9px 16px', borderRadius: 999,
                        fontSize: 14, fontWeight: 700,
                        color: aceso ? '#0b1026' : 'rgba(255,255,255,0.72)',
                        background: aceso
                          ? 'linear-gradient(100deg, #22d3ee, #a855f7)'
                          : 'rgba(255,255,255,0.07)',
                        border: `1px solid ${aceso ? 'transparent' : 'rgba(255,255,255,0.14)'}`,
                        boxShadow: aceso ? '0 8px 26px -10px rgba(168,85,247,0.9)' : 'none',
                        transition: 'background 0.35s ease, color 0.35s ease, box-shadow 0.35s ease',
                      }}
                    >
                      <span aria-hidden>{p.emoji}</span>
                      {p.rotulo}
                    </motion.span>
                  )
                })}
              </div>
            </Revelar>

            {/* Passos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 36 }}>
              {PASSOS.map((p, i) => {
                const Icone = p.icone
                return (
                  <Revelar key={p.titulo} atraso={0.14 + i * 0.09} direcao="esquerda">
                    <div style={{ display: 'flex', gap: 15 }}>
                      <span
                        style={{
                          flexShrink: 0, width: 44, height: 44, borderRadius: 14,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#ffffff',
                          background: 'linear-gradient(140deg, rgba(34,211,238,0.22), rgba(168,85,247,0.28))',
                          border: '1px solid rgba(255,255,255,0.16)',
                        }}
                      >
                        <Icone size={20} strokeWidth={2.2} />
                      </span>
                      <span style={{ paddingTop: 2 }}>
                        <span style={{ display: 'block', fontSize: 17, fontWeight: 800, letterSpacing: -0.3, color: '#ffffff' }}>
                          {p.titulo}
                        </span>
                        <span style={{ display: 'block', marginTop: 4, fontSize: 15, lineHeight: 1.55, color: 'rgba(255,255,255,0.66)' }}>
                          {p.texto}
                        </span>
                      </span>
                    </div>
                  </Revelar>
                )
              })}
            </div>

            <Revelar atraso={0.4}>
              <a
                href="#baixar"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 9, marginTop: 34,
                  padding: '14px 24px', borderRadius: 999, fontSize: 15.5, fontWeight: 800,
                  color: '#0b1026', textDecoration: 'none',
                  background: 'linear-gradient(100deg, #22d3ee, #a855f7)',
                  boxShadow: '0 14px 34px -14px rgba(168,85,247,0.95)',
                }}
              >
                Ver eventos no app
                <ArrowRight size={17} strokeWidth={2.6} />
              </a>
            </Revelar>
          </div>

          {/* ── Celular + ingresso ── */}
          <div className="eventos-visual">
            <motion.div style={{ y: yCelular, position: 'relative' }}>
              <div
                aria-hidden
                style={{
                  position: 'absolute', inset: '-10% -16%', borderRadius: '50%',
                  background: 'radial-gradient(ellipse, rgba(168,85,247,0.30) 0%, rgba(168,85,247,0) 70%)',
                  filter: 'blur(20px)',
                }}
              />
              <Celular src="/telas/04-eventos.png" alt="Tela de eventos do app PraiaGo" largura={286} />
            </motion.div>

            {/* Ingresso flutuando na frente do aparelho */}
            <motion.div
              style={{ y: yIngresso }}
              className="eventos-ingresso"
              initial={{ opacity: 0, rotate: -14, scale: 0.86 }}
              whileInView={{ opacity: 1, rotate: -7, scale: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ type: 'spring', stiffness: 120, damping: 16, delay: 0.25 }}
            >
              <motion.div
                animate={{ rotate: [-7, -4.5, -7], y: [0, -9, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Ingresso />
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>

      <style>{`
        .eventos-grade {
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
          gap: 56px;
          align-items: center;
        }
        .eventos-visual {
          position: relative;
          display: flex;
          justify-content: center;
        }
        .eventos-ingresso {
          position: absolute;
          left: -34px;
          bottom: 26px;
        }
        @media (max-width: 960px) {
          .eventos-grade { grid-template-columns: 1fr; gap: 52px; }
          .eventos-visual { margin-top: 6px; }
        }
        @media (max-width: 560px) {
          /* No celular o ingresso cobria metade do aparelho — melhor recolher
             pro canto e diminuir do que empilhar duas coisas grandes. */
          .eventos-ingresso { left: -6px; bottom: -10px; transform: scale(0.78); transform-origin: bottom left; }
        }
      `}</style>
    </section>
  )
}

/** Cartão de ingresso com os recortes laterais e o QR desenhando na entrada. */
function Ingresso() {
  return (
    <div
      style={{
        position: 'relative',
        width: 232,
        borderRadius: 18,
        padding: '16px 16px 14px',
        background: 'linear-gradient(150deg, #ffffff 0%, #f4f0ff 100%)',
        boxShadow: '0 18px 44px -14px rgba(6,8,30,0.75), 0 2px 6px rgba(6,8,30,0.4)',
      }}
    >
      {/* Recortes das laterais — o que faz "ler" como ingresso e não como card */}
      <span style={{ ...RECORTE, left: -9 }} />
      <span style={{ ...RECORTE, right: -9 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999,
            fontSize: 9.5, fontWeight: 900, letterSpacing: 0.7, textTransform: 'uppercase',
            color: '#7e22ce', background: 'rgba(168,85,247,0.14)',
          }}
        >
          <Ticket size={11} strokeWidth={2.8} />
          Ingresso
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: '#16a34a' }}>PAGO</span>
      </div>

      <div style={{ fontSize: 16.5, fontWeight: 900, letterSpacing: -0.5, color: '#0f172a', lineHeight: 1.15 }}>
        Samba Caiçara
      </div>
      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 3 }}>sáb., 19:00 · Praia Grande, SP</div>

      {/* Picote */}
      <div
        style={{
          margin: '13px -16px',
          borderTop: '2px dashed rgba(15,23,42,0.16)',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <QrAnimado />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: '#94a3b8' }}>
            Entrada
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 1 }}>
            Mostre o código
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 7, color: '#7e22ce' }}>
            <Share2 size={13} strokeWidth={2.4} />
            <MapPin size={13} strokeWidth={2.4} />
          </div>
        </div>
      </div>
    </div>
  )
}

const RECORTE: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  marginTop: -9,
  width: 18,
  height: 18,
  borderRadius: '50%',
  // mesma cor do fundo da seção naquele ponto, pra parecer furo e não bolinha
  background: '#191a44',
}

/** QR decorativo: os módulos aparecem em cascata quando entra na tela. */
function QrAnimado() {
  const ref = useRef<HTMLDivElement>(null)
  const naTela = useInView(ref, { once: true, amount: 0.5 })

  const N = 9
  // Padrão fixo por fórmula — nada de Math.random(), senão muda a cada render.
  const modulos: boolean[] = []
  for (let i = 0; i < N * N; i++) {
    const l = Math.floor(i / N)
    const c = i % N
    const cantoBusca =
      (l < 3 && c < 3) || (l < 3 && c > N - 4) || (l > N - 4 && c < 3)
    modulos.push(cantoBusca ? (l % 2 === 0 || c % 2 === 0) : (l * 3 + c * 5 + l * c) % 3 !== 0)
  }

  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${N}, 1fr)`,
        gap: 1.5,
        width: 58,
        height: 58,
        padding: 5,
        borderRadius: 9,
        background: '#ffffff',
        border: '1px solid rgba(15,23,42,0.10)',
        flexShrink: 0,
      }}
    >
      {modulos.map((cheio, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, scale: 0.3 }}
          animate={naTela ? { opacity: cheio ? 1 : 0.06, scale: 1 } : {}}
          transition={{ duration: 0.25, delay: 0.3 + (i % N) * 0.012 + Math.floor(i / N) * 0.024 }}
          style={{ background: '#0f172a', borderRadius: 1 }}
        />
      ))}
    </div>
  )
}

/** Confetes subindo devagar ao fundo. Posições por fórmula, não aleatórias. */
function Confetes() {
  const CORES = ['#22d3ee', '#a855f7', '#f0abfc', '#fbbf24', '#34d399']
  const pecas = Array.from({ length: 22 }, (_, i) => ({
    esquerda: (i * 41) % 100,
    tamanho: 5 + ((i * 7) % 6),
    atraso: (i % 11) * 0.65,
    duracao: 9 + ((i * 5) % 7),
    cor: CORES[i % CORES.length],
  }))

  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {pecas.map((p, i) => (
        <motion.span
          key={i}
          initial={{ y: 0, opacity: 0, rotate: 0 }}
          animate={{ y: -900, opacity: [0, 0.75, 0.75, 0], rotate: 300 }}
          transition={{ duration: p.duracao, delay: p.atraso, repeat: Infinity, ease: 'linear' }}
          style={{
            position: 'absolute',
            bottom: -30,
            left: `${p.esquerda}%`,
            width: p.tamanho,
            height: p.tamanho * 0.5,
            borderRadius: 1.5,
            background: p.cor,
          }}
        />
      ))}
    </div>
  )
}
