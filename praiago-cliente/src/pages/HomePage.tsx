import { useState, useMemo } from 'react'
import { MapPin, Bell, Search, Star, Clock, ChevronRight, Zap, Heart, X, Plus, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { VENDEDORES, CATEGORIAS, type Vendedor } from '../lib/catalogo'
import { useStore } from '../store/useStore'
import { theme } from '../lib/theme'

const PraiaGoLogo = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <div style={{ width: 32, height: 32, background: theme.gradient.brand, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(14,165,233,0.3)' }}>
      <span style={{ fontSize: 18 }}>🏖️</span>
    </div>
    <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: -1, color: '#0f172a' }}>
      Praia<span style={{ color: theme.color.primary }}>Go</span>
    </span>
  </div>
)

function VendorCard({ v, onClick }: { v: Vendedor; onClick: () => void }) {
  const isFav = useStore(s => s.favoritos.includes(v.id))
  const toggleFavorito = useStore(s => s.toggleFavorito)
  return (
    <div onClick={onClick} role="button" tabIndex={0} style={{ width: 280, flexShrink: 0, cursor: 'pointer', background: '#fff', borderRadius: 20, overflow: 'hidden', border: '1px solid #f1f5f9', boxShadow: theme.shadow.card }}>
      <div style={{ height: 140, position: 'relative', background: v.gradiente }}>
        <img src={v.image} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} alt={v.nome} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 60%)' }} />
        {v.tag && (
          <div style={{ position: 'absolute', top: 12, left: 12, background: '#fff', padding: '4px 10px', borderRadius: 8, fontSize: 10, fontWeight: 800, color: '#0f172a', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
            {v.tag}
          </div>
        )}
        <button
          aria-label={isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          onClick={(e) => { e.stopPropagation(); toggleFavorito(v.id) }}
          style={{ position: 'absolute', top: 10, right: 10, width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
        >
          <Heart size={17} color={isFav ? theme.color.danger : '#94a3b8'} fill={isFav ? theme.color.danger : 'none'} />
        </button>
        <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{v.emoji}</div>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{v.nome}</span>
        </div>
      </div>
      <div style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{v.categoria}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Star size={12} fill={theme.color.star} color={theme.color.star} />
            <span style={{ fontSize: 12, fontWeight: 700, color: theme.color.star }}>{v.avaliacao}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16a34a', fontSize: 12, fontWeight: 600 }}>
            <Clock size={12} /><span>{v.tempo}</span>
          </div>
          <span style={{ color: '#e2e8f0' }}>•</span>
          <span style={{ fontSize: 12, color: '#64748b' }}>{v.distancia}</span>
        </div>
      </div>
    </div>
  )
}

/* ── Painel de notificações ─────────────────────────────── */
function NotifPanel({ onClose }: { onClose: () => void }) {
  const notificacoes = useStore(s => s.notificacoes)
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '70px 16px 0' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 22, overflow: 'hidden', boxShadow: theme.shadow.float }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>Notificações</h3>
          <button aria-label="Fechar" onClick={onClose} style={{ background: '#f8fafc', border: 'none', borderRadius: 10, padding: 7, cursor: 'pointer' }}><X size={18} color="#64748b" /></button>
        </div>
        {notificacoes.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#94a3b8' }}>
            <Bell size={32} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 14, fontWeight: 600 }}>Nenhuma notificação ainda</div>
          </div>
        ) : notificacoes.map(n => (
          <div key={n.id} style={{ padding: '14px 20px', borderBottom: '1px solid #f8fafc', display: 'flex', gap: 12, background: n.lida ? '#fff' : '#f0f9ff' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.lida ? '#cbd5e1' : theme.color.primary, flexShrink: 0, marginTop: 6 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{n.titulo}</div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>{n.texto}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const [busca, setBusca] = useState('')
  const [catSel, setCatSel] = useState<string | null>(null)
  const [soFavoritos, setSoFavoritos] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)

  const favoritos = useStore(s => s.favoritos)
  const naoLidas = useStore(s => s.notificacoes.filter(n => !n.lida).length)
  const marcarTodasLidas = useStore(s => s.marcarTodasLidas)
  const addItem = useStore(s => s.addItem)

  const vendedores = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return VENDEDORES.filter(v => {
      if (soFavoritos && !favoritos.includes(v.id)) return false
      if (catSel && !v.produtos.some(p => p.categoria === catSel)) return false
      if (!termo) return true
      return (
        v.nome.toLowerCase().includes(termo) ||
        v.categoria.toLowerCase().includes(termo) ||
        v.produtos.some(p => p.nome.toLowerCase().includes(termo))
      )
    })
  }, [busca, catSel, soFavoritos, favoritos])

  // "Queridinhos da praia" — produtos reais do catálogo
  const destaques = useMemo(() => (
    VENDEDORES.flatMap(v => v.produtos.map(p => ({ ...p, vendedorId: v.id }))).slice(0, 4)
  ), [])

  const [addedId, setAddedId] = useState<string | null>(null)
  function adicionar(vendedorId: string, produtoId: string) {
    addItem(vendedorId, produtoId, 1)
    setAddedId(produtoId)
    setTimeout(() => setAddedId(curr => (curr === produtoId ? null : curr)), 1100)
  }

  function abrirNotif() { setNotifOpen(true); marcarTodasLidas() }

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#0f172a', paddingBottom: 90 }}>
      {notifOpen && <NotifPanel onClose={() => setNotifOpen(false)} />}

      {/* Header */}
      <header style={{ padding: '16px 20px', position: 'sticky', top: 0, zIndex: 100, background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <PraiaGoLogo />
          <div style={{ display: 'flex', gap: 12 }}>
            <button aria-label="Filtrar favoritos" onClick={() => setSoFavoritos(v => !v)} style={{ background: soFavoritos ? '#fee2e2' : '#f8fafc', border: 'none', width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}>
              <Heart size={20} color={soFavoritos ? theme.color.danger : '#64748b'} fill={soFavoritos ? theme.color.danger : 'none'} />
              {favoritos.length > 0 && <span style={{ position: 'absolute', top: 6, right: 6, minWidth: 14, height: 14, padding: '0 3px', background: theme.color.danger, color: '#fff', borderRadius: 7, fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>{favoritos.length}</span>}
            </button>
            <button aria-label="Notificações" onClick={abrirNotif} style={{ background: '#f8fafc', border: 'none', width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', cursor: 'pointer' }}>
              <Bell size={20} color="#64748b" />
              {naoLidas > 0 && <div style={{ position: 'absolute', top: 9, right: 9, width: 9, height: 9, background: theme.color.danger, borderRadius: '50%', border: '2px solid #fff' }} />}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          <MapPin size={16} color={theme.color.primary} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>Praia Grande, Canto do Forte</span>
          <ChevronRight size={14} color="#64748b" />
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }}>
            <Search size={18} color="#94a3b8" />
          </div>
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="O que você quer comer na areia?"
            aria-label="Buscar ambulantes e produtos"
            style={{ width: '100%', height: 48, background: '#f1f5f9', border: 'none', borderRadius: 14, padding: '0 44px 0 48px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
          />
          {busca && (
            <button aria-label="Limpar busca" onClick={() => setBusca('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: '#fff', padding: 6, borderRadius: 8, border: 'none', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
              <X size={16} color="#0ea5e9" />
            </button>
          )}
        </div>
      </header>

      {/* Featured Banner */}
      {!busca && !catSel && !soFavoritos && (
        <div style={{ padding: '0 20px', marginBottom: 24 }}>
          <div style={{ background: theme.gradient.brand, borderRadius: 24, padding: '24px', color: '#fff', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'relative', zIndex: 2 }}>
              <div style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: 20, display: 'inline-block', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', marginBottom: 12 }}>
                Oferta de Verão ☀️
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.2, marginBottom: 8 }}>Entrega Grátis<br />em toda a areia!</h2>
              <p style={{ fontSize: 12, opacity: 0.9, marginBottom: 16 }}>Aproveite o mar, nós levamos<br />até o seu guarda-sol.</p>
              <button onClick={() => navigate(`/pedir?v=${VENDEDORES[0].id}`)} style={{ background: '#fff', color: theme.color.primary, border: 'none', padding: '10px 20px', borderRadius: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                Pedir agora
              </button>
            </div>
            <div style={{ position: 'absolute', right: -20, bottom: -10, fontSize: 100, opacity: 0.2 }}>🥥</div>
            <div style={{ position: 'absolute', right: 20, top: 20, fontSize: 40, opacity: 0.3 }}>🏖️</div>
          </div>
        </div>
      )}

      {/* Categories */}
      <div style={{ marginBottom: 26 }}>
        <div style={{ padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800 }}>Categorias</h3>
          {catSel && <button onClick={() => setCatSel(null)} style={{ background: 'none', border: 'none', color: theme.color.primary, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Limpar</button>}
        </div>
        <div style={{ display: 'flex', gap: 16, overflowX: 'auto', padding: '0 20px', scrollbarWidth: 'none' }}>
          {CATEGORIAS.map(cat => {
            const sel = catSel === cat.id
            return (
              <button key={cat.id} onClick={() => setCatSel(sel ? null : cat.id)} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer' }}>
                <div style={{ width: 64, height: 64, background: sel ? cat.cor : '#f8fafc', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, border: `1px solid ${sel ? cat.cor : '#f1f5f9'}`, transition: 'all 0.2s', boxShadow: sel ? `0 8px 18px ${cat.cor}55` : 'none' }}>
                  {cat.emoji}
                </div>
                <span style={{ fontSize: 12, fontWeight: sel ? 800 : 600, color: sel ? cat.cor : '#64748b' }}>{cat.nome}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Lista de ambulantes */}
      <div style={{ marginBottom: 30 }}>
        <div style={{ padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800 }}>
            {soFavoritos ? 'Seus favoritos ❤️' : catSel ? `${CATEGORIAS.find(c => c.id === catSel)?.nome} 🏖️` : 'Na sua área 🏖️'}
          </h3>
          <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>{vendedores.length} aberto{vendedores.length === 1 ? '' : 's'}</span>
        </div>
        {vendedores.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
            <Search size={32} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 14, fontWeight: 600 }}>Nada encontrado por aqui</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Tente outra busca ou categoria.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 16, overflowX: 'auto', padding: '0 20px 4px', scrollbarWidth: 'none' }}>
            {vendedores.map(v => (
              <VendorCard key={v.id} v={v} onClick={() => navigate(`/pedir?v=${v.id}`)} />
            ))}
          </div>
        )}
      </div>

      {/* Queridinhos da praia */}
      <div style={{ padding: '0 20px' }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Os queridinhos da praia 🍦</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {destaques.map(item => {
            const added = addedId === item.id
            return (
              <div key={item.id} style={{ background: '#f8fafc', borderRadius: 20, padding: 16, border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{item.emoji}</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{item.nome}</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#16a34a' }}>R$ {item.preco.toFixed(2).replace('.', ',')}</div>
                <button
                  onClick={() => adicionar(item.vendedorId, item.id)}
                  style={{ width: '100%', marginTop: 12, background: added ? '#16a34a' : '#fff', border: `1px solid ${added ? '#16a34a' : '#e2e8f0'}`, borderRadius: 8, padding: '7px', fontSize: 12, fontWeight: 700, color: added ? '#fff' : theme.color.primary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all 0.2s' }}
                >
                  {added ? <><Check size={14} /> Adicionado</> : <><Plus size={14} /> Adicionar</>}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* GPS info */}
      <div style={{ position: 'fixed', bottom: 100, left: 20, right: 20, maxWidth: 390, margin: '0 auto', background: '#0f172a', borderRadius: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, color: '#fff', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(34,197,94,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Zap size={20} color="#22c55e" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>GPS Integrado PraiaGo</div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>Monitorando {VENDEDORES.length} ambulantes próximos em tempo real</div>
        </div>
      </div>
    </div>
  )
}
