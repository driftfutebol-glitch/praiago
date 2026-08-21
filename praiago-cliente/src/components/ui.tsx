import type { ReactNode } from 'react'
import { CalendarDays, ChevronRight, MapPin } from 'lucide-react'

// Peças visuais compartilhadas entre as telas do app cliente.
// Ficam aqui pra Home, Eventos e Radar usarem exatamente o mesmo raio, sombra e
// espaçamento — quando cada tela desenhava o seu, a diferença aparecia na
// rolagem entre abas.

/** Raio/sombra padrão dos cartões brancos do app. */
export const CARTAO: React.CSSProperties = {
  background: '#ffffff',
  borderRadius: 20,
  border: '1px solid #eef2f7',
  boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 26px -14px rgba(15,23,42,0.18)',
}

/** Selo "NOVO" — mesmo em todo lugar (nav, banner, cartão). */
export function SeloNovo({ tom = 'verde' }: { tom?: 'verde' | 'amarelo' }) {
  const cores = tom === 'amarelo'
    ? { fundo: '#fde047', texto: '#713f12' }
    : { fundo: '#16a34a', texto: '#ffffff' }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 7px',
        borderRadius: 999,
        fontSize: 9,
        fontWeight: 900,
        letterSpacing: 0,
        lineHeight: 1.4,
        background: cores.fundo,
        color: cores.texto,
      }}
    >
      NOVO
    </span>
  )
}

/** Cartão de localização do topo da Home. */
export function CartaoLocal({
  cidade,
  descricao,
  onClick,
}: {
  cidade: string
  descricao: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Localização: ${cidade}. ${descricao}`}
      style={{
        ...CARTAO,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '13px 14px',
        cursor: onClick ? 'pointer' : 'default',
        textAlign: 'left',
      }}
    >
      <span
        style={{
          flexShrink: 0,
          width: 38,
          height: 38,
          borderRadius: 13,
          display: 'grid',
          placeItems: 'center',
          background: 'linear-gradient(140deg, #e0f2fe, #dcfce7)',
        }}
      >
        <MapPin size={19} color="#0284c7" strokeWidth={2.4} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 900, color: '#0f172a', letterSpacing: 0 }}>
          {cidade}
        </span>
        <span
          style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 700,
            color: '#64748b',
            marginTop: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {descricao}
        </span>
      </span>
      {onClick && <ChevronRight size={19} color="#94a3b8" strokeWidth={2.4} style={{ flexShrink: 0 }} />}
    </button>
  )
}

/** Faixa que leva pra tela de eventos. */
export function BannerEventos({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ver eventos na Baixada Santista"
      style={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        minHeight: 132,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '17px 15px',
        borderRadius: 22,
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        background: '#082f49',
        boxShadow: '0 16px 34px -16px rgba(2,132,199,0.78)',
      }}
    >
      <img
        src="/images/home-events-v2.webp"
        alt=""
        aria-hidden="true"
        loading="eager"
        decoding="async"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '62% center' }}
      />
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, rgba(2,32,71,0.94) 0%, rgba(3,57,94,0.72) 52%, rgba(2,32,71,0.08) 100%)',
        }}
      />
      <span
        style={{
          position: 'relative',
          flexShrink: 0,
          width: 46,
          height: 46,
          borderRadius: 16,
          display: 'grid',
          placeItems: 'center',
          background: 'rgba(14,165,233,0.3)',
          border: '1px solid rgba(255,255,255,0.42)',
          boxShadow: '0 8px 24px rgba(2,32,71,0.32)',
        }}
      >
        <CalendarDays size={22} color="#ffffff" strokeWidth={2.35} />
      </span>

      <span style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 17, fontWeight: 950, color: '#ffffff', lineHeight: 1.1 }}>
            Eventos na Baixada
          </span>
          <SeloNovo tom="amarelo" />
        </span>
        <span style={{ display: 'block', maxWidth: 180, fontSize: 11.25, lineHeight: 1.32, fontWeight: 750, color: 'rgba(255,255,255,0.88)', marginTop: 5 }}>
          Shows, festas, esportes e experiências na Baixada
        </span>
      </span>

      <span
        style={{
          position: 'relative',
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '9px 10px',
          borderRadius: 999,
          background: '#ffffff',
          color: '#15803d',
          fontSize: 11.5,
          fontWeight: 950,
          boxShadow: '0 6px 16px rgba(2,32,71,0.24)',
        }}
      >
        Ver
        <ChevronRight size={14} strokeWidth={3} />
      </span>
    </button>
  )
}

/** Cabeçalho de seção com título e ação opcional. */
export function TituloSecao({
  titulo,
  acao,
  onAcao,
  children,
}: {
  titulo: string
  acao?: string
  onAcao?: () => void
  children?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 13 }}>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ fontSize: 19, fontWeight: 950, color: '#0f172a', margin: 0, letterSpacing: 0 }}>{titulo}</h3>
        {children}
      </div>
      {acao && (
        <button
          type="button"
          onClick={onAcao}
          style={{
            flexShrink: 0,
            border: 0,
            background: 'transparent',
            color: '#16a34a',
            fontSize: 13,
            fontWeight: 900,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          {acao}
          <ChevronRight size={15} strokeWidth={2.8} />
        </button>
      )}
    </div>
  )
}
