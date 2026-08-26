import { useEffect, useRef } from 'react'
import { Radio, LoaderCircle, MapPinOff } from 'lucide-react'
import { useLocalizacaoAoVivo } from '../hooks/useLocalizacaoAoVivo'

// Botao de compartilhar a localizacao durante a entrega.
//
// Existe porque o vendedor so tinha o ponto onde o cliente estava na hora de
// fazer o pedido. Na praia isso envelhece em minutos: o cliente troca de
// guarda-sol, vai na agua, muda de barraca. O ambulante chegava no lugar
// certo e nao achava ninguem.
//
// Fica desligado por padrao — localizacao ao vivo se oferece, nao se impoe.
// Enquanto ligado, a posicao vai por broadcast (nao grava no banco) e para
// sozinha quando o cliente sai da tela ou desliga.

export default function LocalizacaoAoVivoBotao({
  pedidoId,
  autoIniciar = false,
}: {
  pedidoId: string
  /**
   * Liga sozinho ao abrir a tela. Usado quando o cliente escolheu "Radar GPS"
   * no checkout: ali ele ja disse que queria ser acompanhado ao vivo, e ate
   * agora o app so mandava um ponto congelado — a promessa nao era cumprida.
   */
  autoIniciar?: boolean
}) {
  const { estado, ultima, ligar, desligar, ativo } = useLocalizacaoAoVivo(pedidoId)
  const jaAutoLigou = useRef(false)

  useEffect(() => {
    // Uma vez por montagem. Se o cliente desligar na mao, fica desligado.
    if (!autoIniciar || jaAutoLigou.current) return
    jaAutoLigou.current = true
    ligar()
  }, [autoIniciar, ligar])

  if (estado === 'indisponivel') return null

  if (estado === 'negado') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
        background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12,
        padding: '10px 12px', color: '#9a3412', fontSize: 11.5, fontWeight: 700, lineHeight: 1.4,
      }}>
        <MapPinOff size={15} style={{ flexShrink: 0 }} />
        Sem permissão de localização. Libere nos ajustes do aparelho para o
        vendedor te achar na praia.
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => (ativo ? desligar() : ligar())}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        marginBottom: 12, borderRadius: 12, padding: '11px 12px', cursor: 'pointer',
        background: ativo ? 'rgba(34,197,94,0.10)' : 'rgba(14,165,233,0.08)',
        border: `1px solid ${ativo ? 'rgba(34,197,94,0.30)' : 'rgba(14,165,233,0.22)'}`,
        color: ativo ? '#15803d' : '#0284c7',
        fontSize: 12.5, fontWeight: 800,
      }}
    >
      {estado === 'pedindo'
        ? <LoaderCircle size={15} style={{ animation: 'spin 1s linear infinite' }} />
        : <Radio size={15} />}
      {ativo
        ? (estado === 'pedindo' ? 'Procurando seu GPS…' : 'Enviando sua localização — tocar para parar')
        : 'Compartilhar localização em tempo real'}
      {ultima && ativo && estado === 'ao_vivo' && (
        <span style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.75 }}>
          ±{ultima.precisao}m
        </span>
      )}
    </button>
  )
}
