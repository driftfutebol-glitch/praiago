// Conta bancaria que recebe o dinheiro das vendas.
//
// Regra que a tela precisa deixar clara: o PRIMEIRO cadastro e livre, mas
// TROCAR a conta exige aprovacao. Isso nao e burocracia — trocar a conta de
// recebimento e o golpe classico de marketplace: se a conta do vendedor for
// invadida, o atacante so precisa apontar o dinheiro pra conta dele.
import { useEffect, useState } from 'react'
import { Landmark, AlertCircle, Check, Loader2, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/auth'
import { alertDialog } from '../lib/dialog'
import {
  BANCOS, cadastrarRecebimento, consultarRecebimento, validarConta,
  type ContaRecebimento as Conta,
} from '../lib/recebimento'

type PedidoTroca = { id: string; status: string; created_at: string; parecer: string | null; liberado_ate: string | null }

const inputBase: React.CSSProperties = {
  width: '100%', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 12,
  padding: '11px 12px', fontSize: 14, fontWeight: 600, color: '#0f172a',
  background: '#f8fafc', outline: 'none',
}
const labelBase: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase',
  letterSpacing: 0.6, marginBottom: 4, display: 'block',
}

export default function ContaRecebimento({ onMudou }: { onMudou?: () => void }) {
  const sessao = useSessao()
  const [carregando, setCarregando] = useState(true)
  const [cadastrado, setCadastrado] = useState(false)
  const [conta, setConta] = useState<{ banco_nome?: string; conta_mascarada?: string } | null>(null)
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [troca, setTroca] = useState<PedidoTroca | null>(null)
  const [pedindoTroca, setPedindoTroca] = useState(false)
  const [motivo, setMotivo] = useState('')

  const [form, setForm] = useState<Conta>({
    banco: '', agencia: '', agencia_dv: '', conta: '', conta_dv: '',
    tipo_conta: 'corrente', titular_nome: '', titular_documento: '',
  })

  async function carregar() {
    if (!sessao?.id) return
    const [status, { data: rec }, { data: pedidos }] = await Promise.all([
      consultarRecebimento().catch(() => null),
      supabase.from('seller_recipients').select('banco_nome,conta_mascarada').eq('vendedor_id', sessao.id).maybeSingle(),
      supabase.from('bank_account_change_requests')
        .select('id,status,created_at,parecer,liberado_ate')
        .eq('vendedor_id', sessao.id).order('created_at', { ascending: false }).limit(1),
    ])
    setCadastrado(!!status?.cadastrado)
    setConta((rec as { banco_nome?: string; conta_mascarada?: string } | null) ?? null)
    setTroca((pedidos as PedidoTroca[] | null)?.[0] ?? null)
    setCarregando(false)
  }

  useEffect(() => { carregar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sessao?.id])

  // Aprovado abre uma JANELA de tempo, nao troca a conta sozinho.
  const janelaAberta = troca?.status === 'aprovado' && troca.liberado_ate
    && new Date(troca.liberado_ate).getTime() > Date.now()
  const podeEditar = !cadastrado || janelaAberta

  async function salvar() {
    const msg = validarConta(form)
    if (msg) { setErro(msg); return }
    setErro(''); setSalvando(true)
    try {
      const r = await cadastrarRecebimento(form)
      const banco = BANCOS.find(b => b.codigo === form.banco.replace(/\D/g, ''))
      // Espelho local so pra exibir. A conta completa fica no gateway.
      await supabase.from('seller_recipients').update({
        banco_codigo: form.banco, banco_nome: banco?.nome ?? null,
        conta_mascarada: r.conta_mascarada ?? null,
        titular_nome: form.titular_nome.trim(),
        titular_documento_final: form.titular_documento.replace(/\D/g, '').slice(-4),
      }).eq('vendedor_id', sessao!.id)

      setEditando(false)
      await alertDialog({
        title: 'Conta cadastrada!',
        message: 'Suas vendas passam a cair direto na sua conta. O dinheiro fica liberado pra saque depois da entrega confirmada.',
        tone: 'success',
      })
      carregar(); onMudou?.()
    } catch (e) {
      const err = e as Error & { precisaAprovacao?: boolean }
      setErro(err.message)
      if (err.precisaAprovacao) setPedindoTroca(true)
    }
    setSalvando(false)
  }

  async function pedirTroca() {
    const msg = validarConta(form)
    if (msg) { setErro(msg); return }
    setErro(''); setSalvando(true)
    const banco = BANCOS.find(b => b.codigo === form.banco.replace(/\D/g, ''))
    const digitos = form.conta.replace(/\D/g, '')
    const { error } = await supabase.from('bank_account_change_requests').insert({
      vendedor_id: sessao!.id,
      banco_codigo: form.banco,
      banco_nome: banco?.nome ?? null,
      agencia: form.agencia,
      conta_mascarada: `${'•'.repeat(Math.max(2, digitos.length - 3))}${digitos.slice(-3)}-${form.conta_dv}`,
      titular_nome: form.titular_nome.trim(),
      titular_documento: form.titular_documento.replace(/\D/g, ''),
      motivo: motivo.trim() || null,
    })
    setSalvando(false)
    if (error) {
      // O indice unico impede fila de pedidos repetidos.
      setErro(error.code === '23505'
        ? 'Você já tem um pedido de troca em análise. Aguarde o retorno da equipe.'
        : 'Não deu pra enviar o pedido agora. Tente de novo em instantes.')
      return
    }
    setPedindoTroca(false)
    await alertDialog({
      title: 'Pedido enviado',
      message: 'Nossa equipe vai conferir os dados e falar com você pelo chat do app. Assim que aprovarmos, você poderá trocar a conta.',
      tone: 'success',
    })
    carregar()
  }

  const campo = (k: keyof Conta) => ({
    value: String(form[k] ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => { setForm(f => ({ ...f, [k]: e.target.value })); setErro('') },
  })

  return (
    <div className="glass-panel" style={{ borderRadius: 20, padding: 18, border: '1px solid rgba(0,0,0,0.06)', marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Landmark size={13} /> Conta que recebe suas vendas
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: cadastrado ? '#0f172a' : '#ef4444', marginTop: 4 }}>
            {carregando ? '—' : cadastrado
              ? `${conta?.banco_nome ?? 'Banco'} · ${conta?.conta_mascarada ?? 'conta cadastrada'}`
              : 'Não cadastrada'}
          </div>
        </div>
        {!editando && !pedindoTroca && !carregando && (
          <button
            onClick={() => { if (podeEditar) { setEditando(true) } else { setPedindoTroca(true) } }}
            style={{ border: '1px solid rgba(14,165,233,0.3)', background: '#eff6ff', color: '#0284c7', borderRadius: 12, padding: '8px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {cadastrado ? (janelaAberta ? 'Trocar agora' : 'Trocar conta') : 'Cadastrar'}
          </button>
        )}
      </div>

      {/* Estado do pedido de troca */}
      {!editando && !pedindoTroca && troca && ['pendente', 'em_analise'].includes(troca.status) && (
        <div style={{ marginTop: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: 12, fontSize: 12.5, fontWeight: 700, color: '#b45309' }}>
          Pedido de troca em análise. Nossa equipe vai falar com você pelo chat do app.
        </div>
      )}
      {!editando && !pedindoTroca && troca?.status === 'recusado' && (
        <div style={{ marginTop: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 12, padding: 12, fontSize: 12.5, fontWeight: 700, color: '#dc2626' }}>
          Troca não aprovada.{troca.parecer ? ` ${troca.parecer}` : ' Fale com a equipe pelo chat do app.'}
        </div>
      )}
      {!editando && janelaAberta && (
        <div style={{ marginTop: 12, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 12, padding: 12, fontSize: 12.5, fontWeight: 700, color: '#15803d', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShieldCheck size={14} /> Troca liberada. Cadastre a nova conta antes de {new Date(troca!.liberado_ate!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.
        </div>
      )}

      {(editando || pedindoTroca) && (
        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
          {pedindoTroca && (
            <div style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.25)', borderRadius: 12, padding: 12, fontSize: 12.5, fontWeight: 600, color: '#0369a1' }}>
              Trocar a conta que recebe seu dinheiro passa por conferência da nossa equipe — é assim que protegemos seu faturamento caso alguém acesse sua conta.
            </div>
          )}

          <div>
            <label style={labelBase}>Banco</label>
            <select
              value={form.banco}
              onChange={e => { setForm(f => ({ ...f, banco: e.target.value })); setErro('') }}
              style={{ ...inputBase, cursor: 'pointer' }}
            >
              <option value="">Selecione o banco</option>
              {BANCOS.map(b => <option key={b.codigo} value={b.codigo}>{b.codigo} — {b.nome}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
            <div>
              <label style={labelBase}>Agência</label>
              <input {...campo('agencia')} inputMode="numeric" placeholder="0001" style={inputBase} />
            </div>
            <div>
              <label style={labelBase}>Dígito</label>
              <input {...campo('agencia_dv')} inputMode="numeric" placeholder="opcional" style={inputBase} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
            <div>
              <label style={labelBase}>Conta</label>
              <input {...campo('conta')} inputMode="numeric" placeholder="12345678" style={inputBase} />
            </div>
            <div>
              <label style={labelBase}>Dígito</label>
              <input {...campo('conta_dv')} inputMode="numeric" placeholder="0" style={inputBase} />
            </div>
          </div>

          <div>
            <label style={labelBase}>Tipo de conta</label>
            <select
              value={form.tipo_conta}
              onChange={e => setForm(f => ({ ...f, tipo_conta: e.target.value as 'corrente' | 'poupanca' }))}
              style={{ ...inputBase, cursor: 'pointer' }}
            >
              <option value="corrente">Conta corrente</option>
              <option value="poupanca">Poupança</option>
            </select>
          </div>

          <div>
            <label style={labelBase}>Nome do titular</label>
            <input {...campo('titular_nome')} placeholder="Como está no banco" style={inputBase} />
          </div>

          <div>
            <label style={labelBase}>CPF ou CNPJ do titular</label>
            <input {...campo('titular_documento')} inputMode="numeric" placeholder="Só números" style={inputBase} />
            <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600, marginTop: 4 }}>
              Precisa ser o mesmo documento do seu cadastro — conta de terceiro não é aceita.
            </div>
          </div>

          {pedindoTroca && (
            <div>
              <label style={labelBase}>Por que está trocando?</label>
              <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex: mudei de banco" style={inputBase} />
            </div>
          )}

          {erro && (
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={13} /> {erro}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { setEditando(false); setPedindoTroca(false); setErro('') }}
              style={{ flex: 1, border: '1px solid rgba(0,0,0,0.1)', background: '#fff', color: '#64748b', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button
              onClick={pedindoTroca ? pedirTroca : salvar}
              disabled={salvando}
              style={{ flex: 2, border: 'none', background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', color: '#fff', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 800, cursor: salvando ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {salvando ? <Loader2 size={16} className="animate-spin-slow" /> : <Check size={16} />}
              {pedindoTroca ? 'Enviar pedido' : 'Salvar conta'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
