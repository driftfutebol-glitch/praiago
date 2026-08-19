import { motion } from 'framer-motion'
import { Umbrella, Search, CreditCard, MapPinned } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Versão de celular da seção "Como funciona".
//
// POR QUE NÃO É O VÍDEO AQUI:
// no celular o scrub por scroll não funciona — o iOS Safari engasga ou ignora o
// seek durante o gesto — então a versão anterior caía num vídeo em loop, que
// além de não contar a história direito custava **2,4 MB** de download. Quem
// abre o site está na praia, no 4G, muitas vezes com sinal ruim: é o pior lugar
// possível pra baixar vídeo.
//
// Aqui o vídeo não é nem carregado. A mesma história é contada com uma linha do
// tempo que se revela na rolagem — desenhada em CSS/SVG, alguns KB, e sem
// depender de decodificar mídia.

type Passo = {
  icone: LucideIcon
  titulo: string
  texto: string
  cor: string
}

const PASSOS: Passo[] = [
  {
    icone: Umbrella,
    titulo: 'Você chega na praia',
    texto: 'Estende a canga, senta e não quer mais levantar. Até aí tudo bem.',
    cor: '#38bdf8',
  },
  {
    icone: Search,
    titulo: 'Abre o PraiaGo',
    texto: 'O app mostra quem está perto de você agora: ambulante, quiosque, restaurante e loja.',
    cor: '#22d3ee',
  },
  {
    icone: CreditCard,
    titulo: 'Escolhe e pede',
    texto: 'Cardápio com foto e preço. Paga no PIX ou no cartão, dentro do app.',
    cor: '#34d399',
  },
  {
    icone: MapPinned,
    titulo: 'Acompanha chegando',
    texto: 'Você vê no mapa quem está trazendo o seu pedido — e o quanto falta.',
    cor: '#4ade80',
  },
]

export default function ComoFuncionaMobile() {
  return (
    <section
      id="como-funciona"
      style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '84px 0 92px',
        background: 'linear-gradient(172deg, #012a4a 0%, #04629b 40%, #0891b2 72%, #10a37a 100%)',
      }}
    >
      {/* Ondas no rodapé, as mesmas do hero — amarram a seção à marca sem
          custar download nenhum. */}
      <motion.svg
        viewBox="0 0 1440 200"
        preserveAspectRatio="none"
        animate={{ x: [0, -26, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', bottom: -2, left: 0, width: '120%', height: 90, opacity: 0.5 }}
        aria-hidden
      >
        <path d="M0,120 C240,70 500,165 760,110 C1000,60 1230,145 1440,90 L1440,200 L0,200 Z" fill="rgba(255,255,255,0.16)" />
      </motion.svg>

      <div style={{ position: 'relative', zIndex: 1, padding: '0 22px' }}>
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.5 }}
          style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: 1.8, textTransform: 'uppercase', color: '#7dd3fc' }}
        >
          Como funciona
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.55, delay: 0.06 }}
          style={{
            margin: '12px 0 34px',
            fontSize: 'clamp(28px, 8.4vw, 38px)',
            lineHeight: 1.08,
            fontWeight: 900,
            letterSpacing: -1.2,
            color: '#ffffff',
          }}
        >
          Do guarda-sol
          <br />
          até o seu pedido.
        </motion.h2>

        <ol style={{ listStyle: 'none', margin: 0, padding: 0, position: 'relative' }}>
          {/* Trilho que liga os passos. Cresce junto com a rolagem em vez de
              já aparecer inteiro — é o que dá sensação de progresso. */}
          <motion.span
            aria-hidden
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              left: 27,
              top: 30,
              bottom: 34,
              width: 2,
              transformOrigin: 'top',
              background: 'linear-gradient(#7dd3fc, #4ade80)',
              borderRadius: 999,
              opacity: 0.55,
            }}
          />

          {PASSOS.map((p, i) => {
            const Icone = p.icone
            return (
              <motion.li
                key={p.titulo}
                initial={{ opacity: 0, x: -18 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.55 }}
                transition={{ duration: 0.5, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                style={{ position: 'relative', display: 'flex', gap: 17, paddingBottom: i === PASSOS.length - 1 ? 0 : 26 }}
              >
                <span
                  style={{
                    position: 'relative',
                    zIndex: 1,
                    flexShrink: 0,
                    width: 56,
                    height: 56,
                    borderRadius: 19,
                    display: 'grid',
                    placeItems: 'center',
                    color: '#04233a',
                    background: p.cor,
                    boxShadow: `0 12px 26px -12px ${p.cor}`,
                  }}
                >
                  <Icone size={25} strokeWidth={2.3} />
                </span>

                <span style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 10.5,
                      fontWeight: 900,
                      letterSpacing: 1.4,
                      color: 'rgba(255,255,255,0.5)',
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      marginTop: 3,
                      fontSize: 19,
                      fontWeight: 900,
                      letterSpacing: -0.5,
                      color: '#ffffff',
                      lineHeight: 1.2,
                    }}
                  >
                    {p.titulo}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      marginTop: 6,
                      fontSize: 14.5,
                      lineHeight: 1.55,
                      color: 'rgba(255,255,255,0.74)',
                    }}
                  >
                    {p.texto}
                  </span>
                </span>
              </motion.li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
