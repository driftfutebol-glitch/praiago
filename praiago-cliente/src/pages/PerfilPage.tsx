import { useState } from 'react'
import { Eye, EyeOff, LogIn, LogOut, User, Package, MapPin, ChevronRight, Bell, HelpCircle, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'

function fmtData(ts: number) {
  const diff = Date.now() - ts
  if (diff < 86_400_000) return 'Hoje'
  if (diff < 172_800_000) return 'Ontem'
  return new Date(ts).toLocaleDateString('pt-BR')
}

function TelaLogada() {
  const navigate = useNavigate()
  const sessao = useStore(s => s.sessao)!
  const pedidos = useStore(s => s.pedidos)
  const favoritos = useStore(s => s.favoritos)
  const logout = useStore(s => s.logout)

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', paddingBottom: 24 }}>
      <div style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%)', padding: '32px 20px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, border: '3px solid rgba(255,255,255,0.4)' }}>👤</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', textTransform: 'capitalize' }}>{sessao.nome}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{sessao.email}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <MapPin size={12} color="rgba(255,255,255,0.8)" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>Praia Grande, SP</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 20px', marginTop: -24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {[
            { icon: Package, label: 'Pedidos', value: String(pedidos.length), color: '#0ea5e9' },
            { icon: Star, label: 'Favoritos', value: String(favoritos.length), color: '#fbbf24' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} style={{ background: '#1e293b', borderRadius: 16, padding: 16, textAlign: 'center', border: '1px solid #334155' }}>
              <Icon size={20} color={color} style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>{value}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ background: '#1e293b', borderRadius: 16, padding: '16px 20px', border: '1px solid #334155', marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Pedidos recentes</div>
          {pedidos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#475569', fontSize: 13 }}>Você ainda não fez pedidos.</div>
          ) : pedidos.slice(0, 5).map((p, i) => (
            <div key={p.id} style={{ paddingTop: i > 0 ? 12 : 0, marginTop: i > 0 ? 12 : 0, borderTop: i > 0 ? '1px solid #334155' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{p.vendedorNome}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{p.itens.map(it => `${it.qtd}x ${it.nome}`).join(', ')}</div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{fmtData(p.data)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#22c55e' }}>R$ {p.total}</div>
                <button onClick={() => navigate(`/pedir?v=${p.vendedorId}`)} style={{ fontSize: 11, color: '#0ea5e9', marginTop: 2, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>Pedir de novo</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: '#1e293b', borderRadius: 16, overflow: 'hidden', border: '1px solid #334155', marginBottom: 16 }}>
          {[
            { icon: Bell, label: 'Notificações', onClick: () => navigate('/') },
            { icon: HelpCircle, label: 'Ajuda e suporte', onClick: () => alert('Suporte PraiaGo: (13) 99999-9999') },
          ].map(({ icon: Icon, label, onClick }, i) => (
            <button key={label} onClick={onClick} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderTop: i > 0 ? '1px solid #334155' : 'none' }}>
              <Icon size={18} color="#64748b" />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#f1f5f9', textAlign: 'left' }}>{label}</span>
              <ChevronRight size={16} color="#475569" />
            </button>
          ))}
        </div>

        <button onClick={logout} style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
          <LogOut size={18} color="#ef4444" />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#ef4444' }}>Sair da conta</span>
        </button>
      </div>
    </div>
  )
}

export default function PerfilPage() {
  const sessao = useStore(s => s.sessao)
  const login = useStore(s => s.login)
  const [tab, setTab] = useState<'entrar' | 'cadastro'>('entrar')
  const [verSenha, setVerSenha] = useState(false)
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')

  if (sessao) return <TelaLogada />

  function entrar() {
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErro('Informe um e-mail válido.'); return }
    if (senha.length < 4) { setErro('A senha precisa ter ao menos 4 caracteres.'); return }
    if (tab === 'cadastro' && !nome.trim()) { setErro('Informe seu nome.'); return }
    setErro('')
    login(email, tab === 'cadastro' ? nome : undefined)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🌴</div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>PraiaGo</div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#22c55e', textTransform: 'uppercase' }}>Cliente</div>
        </div>
      </div>

      <div style={{ background: '#1e293b', borderRadius: 24, padding: 28, width: '100%', maxWidth: 380, border: '1px solid #334155' }}>
        <div style={{ display: 'flex', background: '#0f172a', borderRadius: 12, padding: 4, marginBottom: 24 }}>
          {(['entrar', 'cadastro'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setErro('') }} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', background: tab === t ? '#1e293b' : 'transparent', color: tab === t ? '#f1f5f9' : '#475569', boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.3)' : 'none', transition: 'all 0.2s' }}>
              {t === 'entrar' ? 'Entrar' : 'Criar conta'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tab === 'cadastro' && (
            <div>
              <label htmlFor="cli-nome" style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>Nome</label>
              <input id="cli-nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome" style={inputStyle} />
            </div>
          )}
          <div>
            <label htmlFor="cli-email" style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>E-mail</label>
            <input id="cli-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@exemplo.com" style={inputStyle} />
          </div>
          <div>
            <label htmlFor="cli-senha" style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>Senha</label>
            <div style={{ position: 'relative' }}>
              <input id="cli-senha" type={verSenha ? 'text' : 'password'} value={senha} onChange={e => setSenha(e.target.value)} onKeyDown={e => e.key === 'Enter' && entrar()} placeholder="••••••••" style={{ ...inputStyle, padding: '13px 44px 13px 16px' }} />
              <button aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVerSenha(!verSenha)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#475569' }}>
                {verSenha ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {erro && <div style={{ fontSize: 13, color: '#f87171', fontWeight: 600 }}>{erro}</div>}

          <button onClick={entrar} style={{ background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', border: 'none', borderRadius: 14, padding: '15px 0', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}>
            {tab === 'entrar' ? <LogIn size={18} /> : <User size={18} />}
            {tab === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 16px', borderRadius: 12,
  border: '1.5px solid #334155', fontSize: 15, outline: 'none',
  color: '#f1f5f9', background: '#0f172a', boxSizing: 'border-box',
}
