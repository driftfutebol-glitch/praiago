import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, ShieldAlert, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/auth'
import { chamarEdge } from '../lib/edge'
import { alertDialog } from '../lib/dialog'

// Liberacao da movimentacao do saldo (o KYC do recebedor na Pagar.me).
//
// Este arquivo e copiado identico no ambulante e no restaurante.
//
// O buraco que ele fecha: cadastrar a conta bancaria NAO basta. A sub-conta
// nasce em "afiliacao" — a conta ja aparece ativa no painel, o dinheiro das
// vendas ja e do vendedor, mas o saldo nao movimenta. Ninguem avisava disso.
// O vendedor so descobria tentando sacar e levando erro.
//
// Agora: assim que a conta existe, aparece aqui o que falta e o botao que leva
// direto para a verificacao. Depois, uma varredura no servidor (a cada 15 min)
// confere com o gateway e cria o aviso quando aprova — este componente tambem
// escuta a propria linha em tempo real, entao com o app aberto a virada
// aparece na hora.

type Estado = {
  status: string
  kyc_status: string
  kyc_motivo: string | null
  recipient_id: string | null
}

const APRESENTACAO: Record<string, { cor: string; fundo: string; borda: string; titulo: string; texto: string }> = {
  ativo: {
    cor: '#148447', fundo: '#eaf8ef', borda: '#a7dfbd',
    titulo: 'Conta verificada',
    texto: 'Tudo certo. Você já pode vender e sacar o seu dinheiro.',
  },
  pendente: {
    cor: '#b54708', fundo: '#fff4e5', borda: '#f4d39f',
    titulo: 'Falta liberar a movimentação',
    texto: 'Sua conta está cadastrada, mas o banco ainda não libera saque. É uma verificação rápida, feita pelo titular da conta.',
  },
  recusado: {
    cor: '#b42335', fundo: '#fff0f2', borda: '#f0b6bd',
    titulo: 'Verificação não aprovada',
    texto: 'A verificação da sua conta não passou. Confira os dados cadastrados e tente de novo.',
  },
  bloqueado: {
    cor: '#b42335', fundo: '#fff0f2', borda: '#f0b6bd',
    titulo: 'Conta bloqueada',
    texto: 'A conta de recebimento está bloqueada. Fale com a gente pelo chat do app.',
  },
}

export default function VerificacaoRecebedor() {
  const sessao = useSessao()
  const [estado, setEstado] = useState<Estado | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [gerando, setGerando] = useState(false)

  const carregar = useCallback(async () => {
    if (!sessao?.id) return
    const { data } = await supabase
      .from('seller_recipients')
      .select('status,kyc_status,kyc_motivo,recipient_id')
      .eq('vendedor_id', sessao.id)
      .maybeSingle()
    setEstado((data as Estado | null) ?? null)
    setCarregando(false)
  }, [sessao?.id])

  useEffect(() => {
    void carregar()
    if (!sessao?.id) return

    // Sem isto, o vendedor que fica com a tela aberta esperando a aprovacao
    // nao veria nada mudar — a varredura roda no servidor.
    const canal = supabase
      .channel(`recebedor_${sessao.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'seller_recipients', filter: `vendedor_id=eq.${sessao.id}` },
        payload => setEstado(payload.new as Estado),
      )
      .subscribe()

    return () => { void supabase.removeChannel(canal) }
  }, [sessao?.id, carregar])

  // Tres respostas possiveis, e nenhuma delas e erro:
  //
  //   link      -> ha o que fazer, abre agora
  //   aguardar  -> a Pagar.me esta conferindo sozinha, nao ha o que fazer
  //   resolvido -> ja liberou, ou recusou de vez
  //
  // Ate 27/08/2026 isto so sabia abrir link, e qualquer outra coisa virava
  // "Nao deu pra abrir / Pagamento indisponivel no momento" — o que fazia o
  // vendedor achar que o app quebrou quando, na verdade, so faltava esperar.
  type Resposta = {
    situacao?: 'link' | 'aguardar' | 'resolvido' | 'travado'
    url?: string
    titulo?: string
    mensagem?: string
  }

  async function abrirVerificacao() {
    if (gerando) return
    setGerando(true)
    const r = await chamarEdge<Resposta>(
      'recebedor-kyc-link', {},
      'Não foi possível consultar a verificação agora. Tente de novo em instantes.',
    )
    setGerando(false)

    if (!r.ok) {
      await alertDialog({ title: 'Não deu pra consultar', message: r.erro, tone: 'danger' })
      return
    }

    if (r.data?.situacao === 'link' && r.data.url) {
      // O link vale poucos minutos, entao abre agora — nao guarda, nao copia
      // "para depois". Guardar um link desses e guardar algo ja vencendo.
      window.open(r.data.url, '_blank', 'noopener,noreferrer')
      return
    }

    await alertDialog({
      title: r.data?.titulo || 'Verificação em andamento',
      message: r.data?.mensagem || 'O provedor está conferindo os seus dados.',
      tone: 'default',
    })
    // O gateway pode ter avancado sem a varredura ter passado ainda.
    void carregar()
  }

  // Sem conta cadastrada ainda: quem fala e o bloco de conta bancaria, logo
  // acima. Dois avisos sobre a mesma coisa so confunde.
  if (carregando || !estado?.recipient_id) return null

  const chave = estado.status === 'ativo' ? 'ativo'
    : estado.status === 'recusado' ? 'recusado'
      : estado.status === 'bloqueado' ? 'bloqueado'
        : 'pendente'
  const v = APRESENTACAO[chave]
  const precisaAgir = chave === 'pendente' || chave === 'recusado'

  return (
    <div
      className="surface"
      style={{
        borderRadius: 8, padding: 14, marginBottom: 14,
        background: v.fundo, border: `1px solid ${v.borda}`, boxShadow: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flexShrink: 0, color: v.cor, marginTop: 1 }}>
          {chave === 'ativo' ? <ShieldCheck size={19} /> : <ShieldAlert size={19} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 900, color: v.cor }}>{v.titulo}</div>
          <div style={{ marginTop: 3, fontSize: 12, fontWeight: 650, color: v.cor, lineHeight: 1.45, opacity: 0.92 }}>
            {estado.kyc_motivo && chave === 'recusado' ? estado.kyc_motivo : v.texto}
          </div>
        </div>
        {chave !== 'ativo' && (
          <button
            type="button"
            onClick={() => void carregar()}
            aria-label="Conferir de novo"
            title="Conferir de novo"
            style={{ flexShrink: 0, border: 0, background: 'transparent', color: v.cor, cursor: 'pointer', padding: 4 }}
          >
            <RefreshCw size={15} />
          </button>
        )}
      </div>

      {precisaAgir && (
        <button
          type="button"
          onClick={() => void abrirVerificacao()}
          disabled={gerando}
          style={{
            width: '100%', marginTop: 12, padding: '11px 0', borderRadius: 12,
            border: 'none', background: v.cor, color: '#fff',
            fontSize: 13, fontWeight: 900, cursor: gerando ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          }}
        >
          {/* "Ver o que falta" e nao "Fazer a verificacao": nem sempre ha o
              que fazer. As vezes a resposta e "esta em analise, espera" — e
              um botao que promete acao para depois dizer "aguarde" parece
              defeito. */}
          {gerando
            ? <><LoaderCircle size={15} style={{ animation: 'spin 1s linear infinite' }} /> Consultando…</>
            : <><ExternalLink size={15} /> Ver o que falta</>}
        </button>
      )}

      {precisaAgir && (
        <div style={{ marginTop: 8, fontSize: 11, fontWeight: 650, color: v.cor, opacity: 0.8, lineHeight: 1.4 }}>
          O link abre no navegador e vale por poucos minutos. Quem preenche é o
          titular da conta, com documento em mãos.
        </div>
      )}
    </div>
  )
}
