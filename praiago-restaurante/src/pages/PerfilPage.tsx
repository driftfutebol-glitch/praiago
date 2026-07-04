import { useEffect, useState } from 'react'
import { Bell, ChevronRight, CreditCard, HelpCircle, Loader2, LogOut, MapPin, Phone, Shield, Star, Store, TrendingUp } from 'lucide-react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSessao, logout } from '../lib/auth'
import { buscarStatusMercadoPago, iniciarVinculoMercadoPago, type MercadoPagoLinkStatus } from '../lib/mercadopago'

type PerfilInfo = {
  nome: string
  avaliacao: number
  totalAvaliacoes: number
  telefone: string | null
  endereco: string | null
}

type Painel = 'notificacoes' | 'seguranca' | 'ajuda'

const painelConteudo: Record<Painel, { titulo: string; texto: string; itens: string[] }> = {
  notificacoes: {
    titulo: 'Notificacoes e alertas',
    texto: 'Os alertas de pedidos, avaliacoes e mudancas de status ficam ativos enquanto o painel estiver aberto.',
    itens: [
      'Pedidos novos aparecem no sino lateral.',
      'Avaliacoes recebidas entram no painel admin e no historico da loja.',
      'Quando o sinal cair, o mapa mostra o estado da conexao.',
    ],
  },
  seguranca: {
    titulo: 'Privacidade e seguranca',
    texto: 'Sua conta usa login por e-mail e senha. Se houver bloqueio administrativo, o acesso e encerrado automaticamente.',
    itens: [
      'Use um e-mail real e confirmado.',
      'Nao compartilhe a senha do restaurante.',
      'CNPJ e localizacao sao validados no cadastro.',
    ],
  },
  ajuda: {
    titulo: 'Central de ajuda PraiaGo',
    texto: 'Para suporte operacional, informe o nome da loja, e-mail da conta e o pedido afetado.',
    itens: [
      'Problemas com pedido: confira a aba Pedidos.',
      'Problemas com endereco: ajuste o ponto no mapa no cadastro.',
      'Problemas com acesso: solicite revisao ao administrador.',
    ],
  },
}

export default function PerfilPage() {
  const navigate = useNavigate()
  const sessao = getSessao()
  const [perfil, setPerfil] = useState<PerfilInfo>({
    nome: sessao?.nome || 'Meu Restaurante',
    avaliacao: 0,
    totalAvaliacoes: 0,
    telefone: null,
    endereco: null,
  })
  const [pedidosMes, setPedidosMes] = useState(0)
  const [faturamentoMes, setFaturamentoMes] = useState(0)
  const [painelAberto, setPainelAberto] = useState<Painel | null>(null)
  const [mpStatus, setMpStatus] = useState<MercadoPagoLinkStatus | null>(null)
  const [mpLoading, setMpLoading] = useState(false)
  const [mpErro, setMpErro] = useState('')

  useEffect(() => {
    if (!sessao) return

    supabase
      .from('profiles')
      .select('nome, razao_social, avaliacao_media, total_avaliacoes, telefone_comercial, endereco')
      .eq('id', sessao.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        setPerfil({
          nome: data.nome || data.razao_social || sessao.nome || 'Meu Restaurante',
          avaliacao: Number(data.avaliacao_media) || 0,
          totalAvaliacoes: Number(data.total_avaliacoes) || 0,
          telefone: data.telefone_comercial,
          endereco: data.endereco,
        })
      })

    const inicioMes = new Date()
    inicioMes.setDate(1)
    inicioMes.setHours(0, 0, 0, 0)

    supabase
      .from('pedidos')
      .select('total, status')
      .eq('vendedor_id', sessao.id)
      .gte('created_at', inicioMes.toISOString())
      .then(({ data }) => {
        const entregues = (data ?? []).filter(p => p.status === 'entregue')
        setPedidosMes(entregues.length)
        setFaturamentoMes(entregues.reduce((a, p) => a + (Number(p.total) || 0), 0))
      })

    buscarStatusMercadoPago(sessao.id).then(setMpStatus)
  }, [sessao])

  async function conectarMercadoPago() {
    if (!sessao) return
    setMpErro('')
    setMpLoading(true)
    try {
      await iniciarVinculoMercadoPago(sessao.id)
    } catch (err) {
      setMpErro(err instanceof Error ? err.message : 'Nao foi possivel vincular o Mercado Pago.')
      setMpLoading(false)
    }
  }

  function sair() {
    logout()
    navigate('/login')
  }

  return (
    <div style={{ padding: '32px 40px 48px', minHeight: '100vh' }}>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ fontSize: 38, fontWeight: 900, color: '#0f172a', margin: '0 0 8px', letterSpacing: -1 }}>Central do Restaurante</h1>
        <p style={{ fontSize: 15, color: '#64748b', margin: '0 0 32px', fontWeight: 600 }}>Gerencie seu perfil e configuracoes da conta</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel" style={{
        background: 'linear-gradient(135deg, rgba(249,115,22,0.16), rgba(255,255,255,0.92))',
        border: '1px solid rgba(249,115,22,0.25)',
        borderRadius: 24,
        padding: 32,
        marginBottom: 32,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{
            width: 88,
            height: 88,
            borderRadius: 24,
            background: '#fff7ed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(249,115,22,0.28)',
            boxShadow: '0 10px 24px rgba(249,115,22,0.16)',
          }}>
            <Store size={38} color="#f97316" />
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a' }}>{perfil.nome}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={pillStyle}>
                <MapPin size={14} color="#f97316" />
                {perfil.endereco || 'Endereco nao informado'}
              </span>
              <span style={pillStyle}>
                <Star size={14} color="#fbbf24" fill="#fbbf24" />
                {perfil.totalAvaliacoes > 0
                  ? `${perfil.avaliacao.toFixed(1)} · ${perfil.totalAvaliacoes} avaliacoes`
                  : 'Sem avaliacoes ainda'}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginBottom: 32 }}>
        <InfoCard title="Desempenho do mes" icon={<TrendingUp size={16} color="#16a34a" />}>
          <Metric label="Pedidos concluidos" value={String(pedidosMes)} color="#0f172a" />
          <Metric label="Faturamento bruto" value={`R$ ${faturamentoMes.toFixed(2).replace('.', ',')}`} color="#16a34a" />
        </InfoCard>

        <InfoCard title="Informacoes publicas" icon={<MapPin size={16} color="#0ea5e9" />}>
          <PublicInfo icon={<Phone size={18} color="#64748b" />} label="Telefone comercial" value={perfil.telefone || 'Adicione no cadastro'} />
          <PublicInfo icon={<MapPin size={18} color="#64748b" />} label="Endereco da base" value={perfil.endereco || 'Adicione no cadastro'} />
        </InfoCard>
      </div>

      <InfoCard title="Recebimentos Mercado Pago" icon={<CreditCard size={16} color="#0284c7" />}>
        <Metric
          label="Status do split"
          value={mpStatus?.provider === 'mercadopago' && mpStatus.status === 'verificado' ? 'Conta vinculada' : 'Pendente'}
          color={mpStatus?.provider === 'mercadopago' && mpStatus.status === 'verificado' ? '#16a34a' : '#d97706'}
        />
        <button
          type="button"
          onClick={conectarMercadoPago}
          disabled={mpLoading}
          style={{ width: '100%', border: '1px solid rgba(2,132,199,0.25)', background: '#eff6ff', color: '#0284c7', borderRadius: 16, padding: 16, fontSize: 14, fontWeight: 900, cursor: mpLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
        >
          {mpLoading ? <Loader2 size={18} className="animate-spin-slow" /> : <CreditCard size={18} />}
          {mpStatus?.provider === 'mercadopago' ? 'Atualizar vinculo Mercado Pago' : 'Vincular conta Mercado Pago'}
        </button>
        {mpErro && <div style={{ color: '#ef4444', fontSize: 13, fontWeight: 800 }}>{mpErro}</div>}
      </InfoCard>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel" style={{ borderRadius: 24, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.06)', marginBottom: 24 }}>
        {[
          { icon: Bell, label: 'Notificacoes e alertas', painel: 'notificacoes' as const },
          { icon: Shield, label: 'Privacidade e seguranca', painel: 'seguranca' as const },
          { icon: HelpCircle, label: 'Central de ajuda PraiaGo', painel: 'ajuda' as const },
        ].map(({ icon: Icon, label, painel }, i) => (
          <motion.button
            whileHover={{ backgroundColor: 'rgba(249,115,22,0.06)' }}
            whileTap={{ backgroundColor: 'rgba(249,115,22,0.1)' }}
            key={label}
            onClick={() => setPainelAberto(painelAberto === painel ? null : painel)}
            style={{
              width: '100%',
              background: painelAberto === painel ? '#fff7ed' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '20px 24px',
              borderTop: i > 0 ? '1px solid rgba(0,0,0,0.05)' : 'none',
              textAlign: 'left',
            }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 14, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0' }}>
              <Icon size={20} color={painelAberto === painel ? '#f97316' : '#64748b'} />
            </div>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 900, color: '#0f172a' }}>{label}</span>
            <ChevronRight size={18} color="#475569" />
          </motion.button>
        ))}
      </motion.div>

      {painelAberto && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel" style={{ borderRadius: 24, padding: 24, border: '1px solid rgba(249,115,22,0.18)', marginBottom: 24, background: '#ffffff' }}>
          <h2 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: 20, fontWeight: 900 }}>{painelConteudo[painelAberto].titulo}</h2>
          <p style={{ margin: '0 0 16px', color: '#475569', fontSize: 14, lineHeight: 1.6, fontWeight: 600 }}>{painelConteudo[painelAberto].texto}</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {painelConteudo[painelAberto].itens.map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#334155', fontSize: 13, fontWeight: 800 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: '#f97316', flexShrink: 0 }} />
                {item}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <motion.button onClick={sair} whileHover={{ scale: 1.01, backgroundColor: 'rgba(239,68,68,0.08)' }} whileTap={{ scale: 0.98 }} style={{
        width: '100%',
        background: '#fff',
        border: '1px solid rgba(239,68,68,0.25)',
        borderRadius: 20,
        padding: 20,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
      }}>
        <LogOut size={20} color="#ef4444" />
        <span style={{ fontSize: 15, fontWeight: 900, color: '#ef4444', letterSpacing: 1 }}>ENCERRAR SESSAO</span>
      </motion.button>
    </div>
  )
}

function InfoCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="glass-panel" style={{ borderRadius: 24, padding: 24, border: '1px solid rgba(0,0,0,0.06)', background: '#ffffff' }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon} {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
    </motion.div>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: 16, borderRadius: 16, border: '1px solid #e2e8f0' }}>
      <span style={{ fontSize: 14, color: '#64748b', fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 900, color }}>{value}</span>
    </div>
  )
}

function PublicInfo({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', background: '#f8fafc', padding: 16, borderRadius: 16, border: '1px solid #e2e8f0' }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0' }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 800, letterSpacing: 0.4 }}>{label.toUpperCase()}</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{value}</div>
      </div>
    </div>
  )
}

const pillStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 14,
  color: '#334155',
  fontWeight: 700,
  background: '#ffffff',
  padding: '6px 12px',
  borderRadius: 12,
  border: '1px solid rgba(15,23,42,0.08)',
}
