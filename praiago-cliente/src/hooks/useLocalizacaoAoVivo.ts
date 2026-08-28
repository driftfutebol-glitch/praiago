import { useCallback, useEffect, useRef, useState } from 'react'
import { channel } from '../lib/realtime'
import { TOPICO_LOCAL_PEDIDO, type PosicaoAoVivo } from '../lib/localizacaoPedido'

// Localizacao do cliente ao vivo, durante a entrega.
//
// Ate agora o vendedor so tinha o ponto congelado no instante em que o pedido
// foi feito. Na praia isso e quase inutil: o cliente levanta, troca de guarda-
// sol, entra na agua, anda ate o quiosque. O ambulante chegava no lugar certo
// e nao achava ninguem.
//
// Como funciona: enquanto o cliente deixa ligado, o aparelho dele transmite a
// posicao por broadcast do Realtime — NAO grava no banco. Isso importa por
// dois motivos: nao gasta cota de escrita a cada passo do cliente, e o rastro
// nao fica guardado em lugar nenhum depois que a entrega acaba.
//
// Sempre por escolha do cliente, num botao, e desliga sozinho quando a tela
// sai ou o pedido e entregue.

const MIN_ENTRE_ENVIOS_MS = 4_000
// Broadcast nao guarda historico: quem entra depois nao recebe o que passou.
// Este batimento garante que o vendedor abrindo o mapa agora veja uma posicao
// em ate 10s, mesmo com o cliente parado.
const BATIMENTO_MS = 10_000

export type EstadoLocalizacao = 'desligado' | 'pedindo' | 'ao_vivo' | 'negado' | 'indisponivel'

export function useLocalizacaoAoVivo(pedidoId: string) {
  const [estado, setEstado] = useState<EstadoLocalizacao>('desligado')
  const [ultima, setUltima] = useState<PosicaoAoVivo | null>(null)

  const canal = useRef<ReturnType<typeof channel<PosicaoAoVivo>> | null>(null)
  const watchId = useRef<number | null>(null)
  const batimento = useRef<number | undefined>(undefined)
  const ultimoEnvio = useRef(0)
  const posicaoRef = useRef<PosicaoAoVivo | null>(null)

  const desligar = useCallback(() => {
    if (watchId.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current)
    }
    watchId.current = null
    window.clearInterval(batimento.current)
    batimento.current = undefined
    canal.current?.close()
    canal.current = null
    posicaoRef.current = null
    setUltima(null)
    setEstado('desligado')
  }, [])

  const ligar = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setEstado('indisponivel')
      return
    }
    if (watchId.current !== null) return

    setEstado('pedindo')

    // App nativo: sem pedir a permissao do sistema antes, o geolocation do
    // WebView falha calado.
    const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (capacitor?.isNativePlatform?.()) {
      import('@capacitor/geolocation')
        .then(({ Geolocation }) => Geolocation.requestPermissions())
        .catch(() => { /* plugin ausente: segue no geolocation web */ })
    }

    canal.current = channel<PosicaoAoVivo>(TOPICO_LOCAL_PEDIDO(pedidoId))

    function enviar(forcado = false) {
      const p = posicaoRef.current
      if (!p || !canal.current) return
      const agora = Date.now()
      if (!forcado && agora - ultimoEnvio.current < MIN_ENTRE_ENVIOS_MS) return
      ultimoEnvio.current = agora
      canal.current.publish({ ...p, ts: agora })
    }

    watchId.current = navigator.geolocation.watchPosition(
      p => {
        posicaoRef.current = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          precisao: Math.round(p.coords.accuracy ?? 0),
          ts: Date.now(),
        }
        setUltima(posicaoRef.current)
        setEstado('ao_vivo')
        enviar()
      },
      erro => {
        if (erro.code === erro.PERMISSION_DENIED) {
          desligar()
          setEstado('negado')
          return
        }
        // Timeout ou sinal fraco nao desliga: o ultimo ponto continua valendo
        // e o watch tenta de novo sozinho.
        if (!posicaoRef.current) setEstado('pedindo')
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 3_000 },
    )

    batimento.current = window.setInterval(() => enviar(true), BATIMENTO_MS)
  }, [pedidoId, desligar])

  useEffect(() => desligar, [desligar])

  return { estado, ultima, ligar, desligar, ativo: estado === 'ao_vivo' || estado === 'pedindo' }
}
