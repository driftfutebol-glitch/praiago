import { Star } from 'lucide-react'
import Revelar from '../components/Revelar'
import { AVALIACOES } from '../dados'
import type { Avaliacao } from '../dados'

// Duas faixas correndo em sentidos opostos. Cada faixa repete a lista duas
// vezes porque a animacao anda ate -50% e volta pro zero — com a lista dobrada
// a emenda cai exatamente onde a copia comeca, entao o loop fica invisivel.
const METADE = Math.ceil(AVALIACOES.length / 2)
const FAIXA_A = AVALIACOES.slice(0, METADE)
const FAIXA_B = AVALIACOES.slice(METADE)

export default function Avaliacoes() {
  return (
    <section id="avaliacoes" style={{ position: 'relative', padding: '110px 0 120px', background: '#ffffff', overflow: 'hidden' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
        <Revelar>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: '#f59e0b' }}>
            Quem já usa
          </p>
          <h2
            style={{
              margin: '14px 0 0',
              fontSize: 'clamp(30px, 4.6vw, 52px)',
              lineHeight: 1.06,
              fontWeight: 900,
              letterSpacing: -1.6,
              color: '#0f172a',
              maxWidth: 720,
            }}
          >
            Gente da areia,{' '}
            <span className="texto-gradiente">falando da areia</span>.
          </h2>
          <p style={{ margin: '18px 0 0', maxWidth: 580, fontSize: 17.5, lineHeight: 1.6, color: '#475569' }}>
            Cliente no guarda-sol, ambulante com o isopor e quiosque com a cozinha cheia.
          </p>
        </Revelar>
      </div>

      <div style={{ marginTop: 54, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Faixa itens={FAIXA_A} duracao={64} />
        <Faixa itens={FAIXA_B} duracao={78} invertida />
      </div>
    </section>
  )
}

function Faixa({ itens, duracao, invertida }: { itens: Avaliacao[]; duracao: number; invertida?: boolean }) {
  return (
    <div className="marquee" style={{ width: '100%', overflow: 'hidden' }}>
      <div
        className={`marquee-faixa${invertida ? ' invertida' : ''}`}
        style={{ animationDuration: `${duracao}s`, gap: 20, paddingInline: 10 }}
      >
        {[...itens, ...itens].map((a, i) => (
          <Cartao key={`${a.nome}-${i}`} a={a} />
        ))}
      </div>
    </div>
  )
}

function Cartao({ a }: { a: Avaliacao }) {
  return (
    <figure
      style={{
        margin: 0,
        flexShrink: 0,
        width: 340,
        padding: '24px 24px 22px',
        borderRadius: 22,
        background: '#ffffff',
        border: '1px solid rgba(2,32,71,0.08)',
        boxShadow: '0 2px 6px -2px rgba(2,32,71,0.05), 0 16px 36px -24px rgba(2,32,71,0.3)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', gap: 2 }} aria-label={`${a.nota} de 5 estrelas`}>
        {Array.from({ length: 5 }, (_, i) => (
          <Star
            key={i}
            size={16}
            strokeWidth={0}
            fill={i < a.nota ? '#fbbf24' : '#e2e8f0'}
          />
        ))}
      </div>

      <blockquote style={{ margin: 0, fontSize: 15.5, lineHeight: 1.62, color: '#334155' }}>
        “{a.texto}”
      </blockquote>

      <figcaption style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 'auto' }}>
        {/* Inicial no lugar de foto: foto de rosto em depoimento pede pessoa
            real e autorizacao — a inicial resolve o visual sem esse problema. */}
        <span
          style={{
            flexShrink: 0,
            width: 40,
            height: 40,
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 15,
            fontWeight: 800,
            color: '#ffffff',
            background: 'linear-gradient(140deg, #0ea5e9, #22c55e)',
          }}
          aria-hidden
        >
          {a.nome.trim().charAt(0).toUpperCase()}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <span style={{ fontSize: 14.5, fontWeight: 800, color: '#0f172a' }}>{a.nome}</span>
          <span style={{ fontSize: 12.5, color: '#64748b' }}>
            {a.papel} · {a.local}
          </span>
        </span>
      </figcaption>
    </figure>
  )
}
