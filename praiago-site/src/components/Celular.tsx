import type { ReactNode } from 'react'

/**
 * Moldura de celular em volta de um print do app. E so CSS — nada de imagem de
 * aparelho — entao escala em qualquer tamanho sem borrar.
 */
export default function Celular({
  src,
  alt,
  largura = 280,
  children,
  className = '',
}: {
  src?: string
  alt?: string
  largura?: number
  /** conteudo proprio no lugar do print */
  children?: ReactNode
  className?: string
}) {
  const raio = largura * 0.14

  return (
    <div
      className={`sombra-aparelho ${className}`}
      style={{
        width: largura,
        aspectRatio: '1080 / 1920',
        borderRadius: raio,
        padding: largura * 0.032,
        // Casca do aparelho: o gradiente faz a borda parecer metal curvo em vez
        // de um retangulo cinza chapado.
        background: 'linear-gradient(145deg, #2b3a4a 0%, #0b1620 38%, #16232f 62%, #35485c 100%)',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          borderRadius: raio * 0.82,
          overflow: 'hidden',
          background: '#ffffff',
        }}
      >
        {src ? (
          <img
            src={src}
            alt={alt ?? ''}
            draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
          />
        ) : (
          children
        )}

        {/* Reflexo diagonal no vidro */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'linear-gradient(118deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.06) 22%, rgba(255,255,255,0) 42%)',
          }}
        />
      </div>

      {/* Ilha da camera */}
      <div
        style={{
          position: 'absolute',
          top: largura * 0.058,
          left: '50%',
          transform: 'translateX(-50%)',
          width: largura * 0.3,
          height: largura * 0.075,
          borderRadius: 999,
          background: '#050c12',
        }}
      />
    </div>
  )
}
