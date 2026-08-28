import { useEffect, useRef, useState } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
// Todo useTransform ligado ao scroll passa por `faixa` — o motivo esta la.
import { faixa, interpolar } from '../lib/animacao'
import ComoFuncionaMobile from './ComoFuncionaMobile'

// ── Secao do video controlado pela rolagem ──────────────────────────────────
// O video nao toca sozinho: cada "tiquinho" de scroll do mouse avanca um pedaco
// do filme. A pessoa rola e a cena anda junto — e o efeito que o Pedro pediu.
//
// ⚠️ MARCA D'AGUA DO GEMINI
// O video foi gerado no Gemini e tem o "sparkle" de 4 pontas gravado no pixel.
// Medi no frame: ocupa x 1124..1163 e y 568..608 num quadro de 1280x720 — ou
// seja, a borda ESQUERDA dela comeca a 87,8% da largura. Sem ffmpeg na maquina
// nao da pra apagar de verdade (delogo), entao o corte e no CSS: o <video>
// entra com 116% da largura do container, ancorado a esquerda, e o container
// tem overflow hidden. Assim os ~14% da direita — onde mora a marca — ficam
// fora da area visivel.
//
// Por que 116% funciona nos dois jeitos que o `object-fit: cover` pode cair:
//   * se o corte do cover for VERTICAL, o conteudo ocupa a largura toda da
//     caixa: a marca cai em 1,16 x 0,878 = 1,018 da largura visivel → fora.
//   * se o corte for HORIZONTAL, o conteudo transborda centralizado; fazendo a
//     conta, a marca so entraria se o transbordo fosse menor que 1,111 — e esse
//     caso so existe quando ele ja passa de 1,16 → tambem fora.
// Ou seja: em qualquer proporcao de tela a marca fica escondida. Se um dia o
// video for reprocessado sem a marca, e so por LARGURA_VIDEO de volta em 100%.
const LARGURA_VIDEO = '116%'

// Quanto de rolagem a secao ocupa. 380vh = o filme inteiro em ~3,8 telas de
// scroll: menos que isso passa rapido demais pra ler as legendas, mais que isso
// cansa antes de acabar.
const ALTURA_ROLAGEM = '380vh'

type Legenda = { de: number; ate: number; titulo: string; texto: string }

// Faixas em fracao do progresso (0 = comeco da secao, 1 = fim).
const LEGENDAS: Legenda[] = [
  {
    de: 0.02,
    ate: 0.24,
    titulo: 'Você chega na praia',
    texto: 'Estende a canga, senta e não quer mais levantar. Até aí tudo bem.',
  },
  {
    de: 0.26,
    ate: 0.48,
    titulo: 'Abre o PraiaGo',
    texto: 'O app mostra quem está perto de você agora: ambulante, quiosque, restaurante e loja.',
  },
  {
    de: 0.5,
    ate: 0.7,
    titulo: 'Escolhe e pede',
    texto: 'Cardápio com foto e preço. Paga no PIX ou no cartão, dentro do app.',
  },
  {
    de: 0.72,
    ate: 0.9,
    titulo: 'Acompanha chegando',
    texto: 'Você vê no mapa quem está trazendo o seu pedido — e o quanto falta.',
  },
]

export default function VideoScroll() {
  const secaoRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [pronto, setPronto] = useState(false)
  // Decidido JÁ NA PRIMEIRA RENDERIZAÇÃO (initializer preguiçoso), não num
  // efeito: se começar como `false`, o <video> entra no DOM por um instante e
  // o navegador já dispara o download de 2,4 MB antes de a gente trocar pra
  // versão de celular. Assim ele nunca chega a existir no celular.
  const [modoLeve, setModoLeve] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(pointer: coarse)').matches
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  const { scrollYProgress } = useScroll({
    target: secaoRef,
    offset: ['start start', 'end end'],
  })

  // No celular (e pra quem pediu menos animacao) NAO da pra fazer scrub:
  // iOS Safari engasga ou simplesmente ignora o seek durante o gesto. Nesses
  // casos o video toca sozinho em loop — a secao continua funcionando, so nao
  // e a rolagem que comanda.
  useEffect(() => {
    const grosso = window.matchMedia('(pointer: coarse)')
    const menosMovimento = window.matchMedia('(prefers-reduced-motion: reduce)')
    const avaliar = () => setModoLeve(grosso.matches || menosMovimento.matches)
    avaliar()
    grosso.addEventListener('change', avaliar)
    menosMovimento.addEventListener('change', avaliar)
    return () => {
      grosso.removeEventListener('change', avaliar)
      menosMovimento.removeEventListener('change', avaliar)
    }
  }, [])

  // No modo leve o video tem que TOCAR sozinho — e nao basta o atributo
  // `autoPlay`. Na primeira renderizacao `modoLeve` ainda e false, entao o
  // efeito de scrub roda e da `pause()` no video; quando o media query e
  // avaliado e vira true, o autoplay ja passou e o video ficava congelado num
  // quadro so no celular. Por isso o play e explicito aqui.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !modoLeve || !pronto) return
    video.play().catch(() => {
      /* navegador pode recusar; mudo + inline quase sempre passa, e se nao
         passar fica o poster do primeiro quadro em vez de quebrar */
    })
  }, [modoLeve, pronto])

  // Scrub: UM seek por vez, sempre mirando a posicao atual da rolagem.
  //
  // A primeira versao disso interpolava o tempo e escrevia `currentTime` em
  // todo quadro de rAF. Nao funciona: cada escrita dispara um seek assincrono,
  // e como o video nao tem keyframe em todo quadro, o decoder leva dezenas de
  // ms pra servir cada um. Escrevendo 60x por segundo a fila so cresce e o
  // filme fica pra tras — medido aqui, andava ~0,2s de video a cada 0,5s real,
  // ou seja, nunca alcancava o scroll.
  //
  // Aqui o proximo seek so sai depois que o anterior termina (evento `seeked`),
  // e ele vai DIRETO pro alvo, sem interpolar. Assim nao existe fila: o video
  // acompanha na velocidade que o decoder aguenta e sempre mostra a posicao
  // real da rolagem, nunca uma posicao velha.
  useEffect(() => {
    if (modoLeve) return
    const video = videoRef.current
    if (!video) return

    video.pause()
    let rodando = true
    let buscando = false
    let quadro = 0

    const aoTerminarBusca = () => {
      buscando = false
    }
    video.addEventListener('seeked', aoTerminarBusca)
    // Se um seek falhar, `seeked` nunca vem e o scrub travaria de vez.
    video.addEventListener('error', aoTerminarBusca)

    const passo = () => {
      if (!rodando) return
      quadro = requestAnimationFrame(passo)

      const dur = video.duration
      if (buscando || !dur || Number.isNaN(dur) || video.readyState < 2) return

      const alvo = Math.min(Math.max(scrollYProgress.get(), 0), 1) * dur
      // 0.05s ≈ um quadro e meio do video: abaixo disso nao vale o seek.
      if (Math.abs(video.currentTime - alvo) < 0.05) return

      buscando = true
      try {
        video.currentTime = alvo
      } catch {
        buscando = false // buffer ainda nao chegou; tenta no proximo quadro
      }
    }

    quadro = requestAnimationFrame(passo)
    return () => {
      rodando = false
      cancelAnimationFrame(quadro)
      video.removeEventListener('seeked', aoTerminarBusca)
      video.removeEventListener('error', aoTerminarBusca)
    }
  }, [modoLeve, scrollYProgress])

  // Barra de progresso do filme
  const larguraBarra = useTransform(scrollYProgress, (v) => `${Math.max(0, Math.min(1, v)) * 100}%`)
  // O aviso de "role pra continuar" some assim que a pessoa entende
  const opacidadeDica = useTransform(scrollYProgress, faixa([0, 0.06], [1, 0]))

  // Celular tem uma seção própria: o scrub não funciona no gesto de toque e o
  // vídeo é peso morto no 4G da praia. Todos os hooks acima já rodaram, então
  // este retorno antecipado é seguro.
  if (modoLeve) return <ComoFuncionaMobile />

  return (
    <section
      ref={secaoRef}
      id="como-funciona"
      style={{ position: 'relative', height: ALTURA_ROLAGEM, background: '#04121f' }}
    >
      <div
        style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden', // e o que efetivamente corta a marca do Gemini
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <video
          ref={videoRef}
          src="/scroll.mp4"
          muted
          playsInline
          preload="auto"
          autoPlay={modoLeve}
          loop={modoLeve}
          onLoadedData={() => setPronto(true)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: LARGURA_VIDEO,
            // ⚠️ O preflight do Tailwind poe `max-width:100%` em img/video. Sem
            // anular isso aqui, os 116% acima sao truncados de volta pra 100% e
            // a marca do Gemini volta a aparecer. (Mesma pegadinha do recorte
            // da logo em Marca.tsx.)
            maxWidth: 'none',
            height: '100%',
            objectFit: 'cover',
            opacity: pronto ? 1 : 0,
            transition: 'opacity 0.6s ease',
          }}
        />

        {/* Escurecimento pras legendas terem contraste em cima de qualquer frame */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'linear-gradient(180deg, rgba(2,14,26,0.72) 0%, rgba(2,14,26,0.20) 30%, rgba(2,14,26,0.28) 62%, rgba(2,14,26,0.85) 100%)',
          }}
        />

        {/* Legendas: cada uma aparece na sua faixa de rolagem */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            width: '100%',
            maxWidth: 1120,
            padding: '0 24px',
            height: '100%',
          }}
        >
          {LEGENDAS.map((l, i) => (
            <LegendaAnimada key={i} legenda={l} progresso={scrollYProgress} indice={i} />
          ))}
        </div>

        {/* Dica de rolagem */}
        <motion.div
          style={{
            opacity: opacidadeDica,
            position: 'absolute',
            bottom: 84,
            left: 0,
            right: 0,
            zIndex: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 1.6,
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.82)',
            }}
          >
            {modoLeve ? 'role pra ver' : 'role o mouse'}
          </span>
          <div
            style={{
              width: 26,
              height: 42,
              borderRadius: 999,
              border: '2px solid rgba(255,255,255,0.6)',
              display: 'flex',
              justifyContent: 'center',
              paddingTop: 7,
            }}
          >
            <span
              className="roda-mouse"
              style={{ width: 3.5, height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.9)' }}
            />
          </div>
        </motion.div>

        {/* Barra de progresso do filme */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 4,
            background: 'rgba(255,255,255,0.14)',
            zIndex: 3,
          }}
        >
          <motion.div
            style={{
              width: larguraBarra,
              height: '100%',
              background: 'linear-gradient(90deg, #0ea5e9, #22c55e)',
            }}
          />
        </div>
      </div>
    </section>
  )
}

/** Uma legenda que entra e sai dentro da sua faixa de progresso. */
function LegendaAnimada({
  legenda,
  progresso,
  indice,
}: {
  legenda: Legenda
  progresso: ReturnType<typeof useScroll>['scrollYProgress']
  indice: number
}) {
  const { de, ate } = legenda
  const margem = (ate - de) * 0.26 // tempo de entrada e de saida
  const marcos = [de, de + margem, ate - margem, ate]

  // Sempre com funcao — ver lib/animacao.ts.
  const opacidade = useTransform(progresso, faixa(marcos, [0, 1, 1, 0]))
  const y = useTransform(progresso, faixa(marcos, [46, 0, 0, -46]))
  const filtro = useTransform(progresso, (v) => `blur(${interpolar(v, marcos, [8, 0, 0, 8])}px)`)

  // Alterna o lado pra tela nao ficar parada — e o olho acompanha a troca.
  const naEsquerda = indice % 2 === 0

  return (
    <motion.div
      style={{
        opacity: opacidade,
        y,
        filter: filtro,
        position: 'absolute',
        top: '50%',
        marginTop: -110,
        left: naEsquerda ? 24 : 'auto',
        right: naEsquerda ? 'auto' : 24,
        maxWidth: 480,
        textAlign: naEsquerda ? 'left' : 'right',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: '#7dd3fc',
          marginBottom: 14,
        }}
      >
        {String(indice + 1).padStart(2, '0')}
      </span>
      <h3
        style={{
          margin: 0,
          fontSize: 'clamp(30px, 5.2vw, 56px)',
          lineHeight: 1.04,
          fontWeight: 900,
          letterSpacing: -1.4,
          color: '#ffffff',
          textShadow: '0 4px 30px rgba(0,10,20,0.6)',
        }}
      >
        {legenda.titulo}
      </h3>
      <p
        style={{
          margin: '16px 0 0',
          fontSize: 'clamp(15px, 1.7vw, 19px)',
          lineHeight: 1.55,
          color: 'rgba(255,255,255,0.86)',
          textShadow: '0 2px 16px rgba(0,10,20,0.7)',
        }}
      >
        {legenda.texto}
      </p>
    </motion.div>
  )
}
