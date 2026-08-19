// A logo oficial e um PNG quadrado com MUITA margem transparente em volta —
// usada direto ela fica minuscula no meio de um quadrado enorme. Entao aqui a
// gente recorta: o <div> e a janela (proporcao 140x59, so a arte) e a <img>
// entra superdimensionada e deslocada pra so a marca aparecer.
// Esses numeros sao os mesmos do app cliente (IntroSplash.tsx) — se um dia a
// arte do PNG mudar, tem que ajustar nos dois lugares.

export default function Marca({
  largura = 200,
  className = '',
  filtro,
}: {
  largura?: number | string
  className?: string
  /** filtro CSS extra — usado pra dar contorno quando o fundo e escuro */
  filtro?: string
}) {
  return (
    <div
      aria-label="PraiaGo"
      role="img"
      className={className}
      style={{
        position: 'relative',
        width: typeof largura === 'number' ? `${largura}px` : largura,
        aspectRatio: '140 / 59',
        overflow: 'hidden',
        filter: filtro,
      }}
    >
      <img
        src="/praiago-logo-transparent.png"
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          width: '165%',
          height: '391.5%',
          left: '-40%',
          top: '-113.6%',
          maxWidth: 'none',
          display: 'block',
        }}
      />
    </div>
  )
}
