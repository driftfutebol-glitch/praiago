// Cena de praia usada no topo da Home e da tela de Eventos.
//
// É DESENHADA EM SVG, não é foto. Motivo: o app não tem nenhuma imagem de praia
// (o `src/assets/hero.png` é sobra de template — um cubo roxo), e pôr foto de
// banco de imagens num app que vende de praia real cria dois problemas: peso de
// download no 4G da areia e uma cena que não é da praia do usuário. Em SVG
// escala em qualquer tela, pesa ~2KB e combina exatamente com a paleta da marca.
//
// Fica atrás do texto do cabeçalho, então tudo aqui é de baixo contraste de
// propósito — se aparecer mais que o título, está errado.

export default function CenaPraia({
  altura = 190,
  className,
}: {
  altura?: number
  className?: string
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 420 190"
      preserveAspectRatio="xMaxYMid slice"
      style={{ display: 'block', width: '100%', height: altura }}
    >
      <defs>
        <linearGradient id="prg-ceu" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e0f2fe" />
          <stop offset="55%" stopColor="#f0f9ff" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
        <linearGradient id="prg-mar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
        <linearGradient id="prg-areia" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fde8b8" />
          <stop offset="100%" stopColor="#fbd88f" />
        </linearGradient>
        {/* Esvanece a cena pela esquerda pra ela morrer atrás do texto */}
        <linearGradient id="prg-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="42%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="prg-mascara">
          <rect x="0" y="0" width="420" height="190" fill="url(#prg-fade)" />
        </mask>
      </defs>

      <rect x="0" y="0" width="420" height="190" fill="url(#prg-ceu)" />

      {/* Skyline discreto no horizonte — é o que faz ler como Baixada Santista
          e não como praia deserta genérica. */}
      <g fill="#cbd5e1" opacity="0.55">
        {[
          [232, 62, 12, 46], [246, 48, 10, 60], [258, 66, 13, 42], [273, 40, 11, 68],
          [286, 58, 14, 50], [302, 34, 10, 74], [314, 60, 12, 48], [328, 46, 13, 62],
          [343, 66, 11, 42], [356, 52, 14, 56], [372, 38, 10, 70], [384, 62, 12, 46],
          [398, 50, 13, 58],
        ].map(([x, y, l, a], i) => (
          <rect key={i} x={x} y={y} width={l} height={a} rx="1.5" />
        ))}
      </g>

      {/* Mar */}
      <path d="M0,112 Q120,104 230,110 T420,106 L420,140 L0,140 Z" fill="url(#prg-mar)" opacity="0.85" />
      {/* Espuma */}
      <path
        d="M0,138 Q90,131 180,137 T420,133"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.75"
      />

      {/* Faixa de areia */}
      <path d="M0,140 Q110,133 220,139 T420,135 L420,190 L0,190 Z" fill="url(#prg-areia)" />

      {/* Coqueiros na areia */}
      <Coqueiro x={44} y={150} escala={1} />
      <Coqueiro x={106} y={158} escala={0.78} />
      <Coqueiro x={330} y={152} escala={0.9} />
      <Coqueiro x={386} y={162} escala={0.7} />

      {/* Guarda-sóis */}
      <Guardasol x={172} y={162} cor="#fb923c" />
      <Guardasol x={214} y={170} cor="#22c55e" />
      <Guardasol x={262} y={160} cor="#0ea5e9" />

      {/* Sol */}
      <circle cx="352" cy="44" r="17" fill="#fcd34d" opacity="0.9" />

      {/* Máscara de esvanecimento pela esquerda */}
      <rect x="0" y="0" width="420" height="190" fill="#ffffff" mask="url(#prg-mascara)" opacity="0.92" />
    </svg>
  )
}

function Coqueiro({ x, y, escala = 1 }: { x: number; y: number; escala?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${escala})`}>
      {/* Tronco levemente curvado, como coqueiro de praia de verdade */}
      <path d="M0,0 C-2,-14 1,-26 5,-38" stroke="#a16207" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <g fill="#16a34a">
        <path d="M5,-38 C-6,-46 -16,-45 -22,-39 C-13,-42 -6,-41 5,-38 Z" />
        <path d="M5,-38 C16,-47 26,-46 31,-40 C22,-43 15,-42 5,-38 Z" />
        <path d="M5,-38 C-2,-50 2,-58 9,-62 C6,-54 5,-46 5,-38 Z" />
        <path d="M5,-38 C14,-44 20,-52 20,-58 C14,-51 9,-44 5,-38 Z" />
        <path d="M5,-38 C-4,-42 -12,-50 -13,-56 C-6,-49 0,-43 5,-38 Z" />
      </g>
      <ellipse cx="2" cy="1" rx="9" ry="2.2" fill="#eab308" opacity="0.35" />
    </g>
  )
}

function Guardasol({ x, y, cor }: { x: number; y: number; cor: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0,0 L0,-13" stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M-13,-13 A13,9 0 0 1 13,-13 Z" fill={cor} opacity="0.9" />
      <ellipse cx="0" cy="1" rx="7" ry="1.8" fill="#eab308" opacity="0.3" />
    </g>
  )
}
