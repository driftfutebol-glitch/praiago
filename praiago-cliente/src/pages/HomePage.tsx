import { useEffect, useMemo, useState } from 'react'
import {
  Bell, Check, ChevronRight, Clock, Grid2X2, Heart, MapPin, Percent, Plus,
  Search, ShoppingBag, Star, Store, Ticket, Utensils, X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  CATEGORIAS,
  pertenceACategoria,
  type CategoriaId,
  type Produto,
  type Vendedor,
} from '../lib/catalogo'
import { useCatalogo } from '../store/useCatalogo'
import { useStore } from '../store/useStore'
import { theme } from '../lib/theme'
import { supabase } from '../lib/supabase'

type ProdutoDestaque = Produto & { vendedorId: string; vendedorNome: string }
type Categoria = typeof CATEGORIAS[number]
type Cupom = {
  id: string
  codigo: string
  titulo: string
  descricao: string | null
  tipo: 'percentual' | 'valor_fixo' | 'frete_gratis'
  valor: number
  valor_minimo: number
  limite_uso: number | null
  usos: number
  ativo: boolean
  publico: boolean
  vendedor_tipo: 'restaurante' | 'ambulante' | null
  validade: string | null
}

const cardShadow = '0 16px 40px rgba(15,23,42,0.10)'
const CATEGORY_SPRITE = '/images/categorias-comida-v1.png'
const CATEGORIAS_DESTAQUE: readonly CategoriaId[] = ['bebidas', 'espetos', 'salgados', 'porcoes', 'almoco', 'acai']

function NotifPanel({ onClose }: { onClose: () => void }) {
  const notificacoes = useStore(s => s.notificacoes)
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '76px 16px 0' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, background: '#fff', borderRadius: 24, overflow: 'hidden', boxShadow: theme.shadow.float, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ fontSize: 17, fontWeight: 900, color: '#0f172a', margin: 0 }}>Notificações</h3>
          <button aria-label="Fechar" onClick={onClose} style={iconButton('#f8fafc')}><X size={18} color="#64748b" /></button>
        </div>
        {notificacoes.length === 0 ? (
          <div style={{ padding: '42px 20px', textAlign: 'center', color: '#64748b' }}>
            <Bell size={32} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 14, fontWeight: 700 }}>Nada novo por enquanto</div>
          </div>
        ) : notificacoes.map(n => (
          <div key={n.id} style={{ padding: '14px 18px', borderBottom: '1px solid #f8fafc', display: 'flex', gap: 12, background: n.lida ? '#fff' : '#f0f9ff' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.lida ? '#cbd5e1' : theme.color.primary, flexShrink: 0, marginTop: 6 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{n.titulo}</div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>{n.texto}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CategoryPhoto({ categoria, className }: { categoria: Categoria; className?: string }) {
  const [coluna, linha] = categoria.sprite
  const zoom = 1.25
  const posicaoX = ((coluna * zoom + (zoom - 1) / 2) / (5 * zoom - 1)) * 100
  const posicaoY = ((linha * zoom + (zoom - 1) / 2) / (6 * zoom - 1)) * 100
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: 'block',
        backgroundImage: `url(${CATEGORY_SPRITE})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${5 * zoom * 100}% ${6 * zoom * 100}%`,
        backgroundPosition: `${posicaoX}% ${posicaoY}%`,
      }}
    />
  )
}

function CategoriasPanel({
  catalogo,
  selecionada,
  onClose,
  onSelect,
}: {
  catalogo: Vendedor[]
  selecionada: CategoriaId | null
  onClose: () => void
  onSelect: (categoriaId: CategoriaId) => void
}) {
  useEffect(() => {
    const overflowAnterior = document.body.style.overflow
    const fecharComEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', fecharComEscape)
    return () => {
      document.body.style.overflow = overflowAnterior
      window.removeEventListener('keydown', fecharComEscape)
    }
  }, [onClose])

  return (
    <div
      className="prg-category-backdrop"
      role="presentation"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 10020, background: 'rgba(15,23,42,0.48)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <section
        className="prg-category-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="categorias-title"
        onClick={event => event.stopPropagation()}
        style={{ width: '100%', maxWidth: 620, height: 'min(88dvh, 780px)', overflowY: 'auto', background: '#f8fafc', borderRadius: '24px 24px 0 0', boxShadow: '0 -18px 52px rgba(15,23,42,0.22)' }}
      >
        <div style={{ position: 'sticky', top: 0, zIndex: 2, minHeight: 68, display: 'grid', gridTemplateColumns: '44px 1fr 44px', alignItems: 'center', padding: '8px 14px', background: 'rgba(248,250,252,0.96)', backdropFilter: 'blur(14px)', borderBottom: '1px solid #e2e8f0' }}>
          <button type="button" aria-label="Fechar categorias" onClick={onClose} style={{ ...iconButton('#fff'), borderRadius: 12 }}>
            <X size={21} color="#0f172a" />
          </button>
          <h2 id="categorias-title" style={{ margin: 0, textAlign: 'center', fontSize: 20, fontWeight: 950, color: '#0f172a' }}>Todos</h2>
          <span />
        </div>

        <div className="prg-category-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, padding: '14px 14px 112px' }}>
          {CATEGORIAS.map(categoria => {
            const selecionadaAgora = selecionada === categoria.id
            const count = catalogo.filter(vendedor => vendedor.produtos.some(produto => pertenceACategoria(produto.categoria, categoria.id))).length
            return (
              <button
                key={categoria.id}
                type="button"
                aria-pressed={selecionadaAgora}
                aria-label={`${categoria.nome}: ${count} ${count === 1 ? 'loja' : 'lojas'}`}
                onClick={() => onSelect(categoria.id)}
                className="prg-category-tile"
                style={{ position: 'relative', minHeight: 112, overflow: 'hidden', borderRadius: 14, border: `1px solid ${selecionadaAgora ? categoria.cor : '#e2e8f0'}`, background: '#fff', padding: '14px 10px 12px 14px', textAlign: 'left', cursor: 'pointer', boxShadow: selecionadaAgora ? `0 10px 24px ${categoria.cor}28` : '0 5px 16px rgba(15,23,42,0.05)' }}
              >
                <span style={{ position: 'relative', zIndex: 1, display: 'block', maxWidth: '62%', fontSize: 15, fontWeight: 900, color: '#0f172a', lineHeight: 1.15 }}>{categoria.nome}</span>
                <span style={{ position: 'absolute', zIndex: 1, left: 14, bottom: 13, fontSize: 10, fontWeight: 800, color: selecionadaAgora ? categoria.cor : '#64748b' }}>{count} {count === 1 ? 'loja' : 'lojas'}</span>
                <CategoryPhoto categoria={categoria} className="prg-category-photo-large" />
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function QuickAction({
  title, subtitle, icon, color, onClick, disabled,
}: {
  title: string
  subtitle: string
  icon: React.ReactNode
  color: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      aria-label={`${title}: ${subtitle}`}
      onClick={onClick}
      disabled={disabled}
      className={disabled ? 'prg-action-card' : 'prg-action-card prg-lift'}
      style={{
        minHeight: 112,
        border: `1px solid ${color}38`,
        borderRadius: 20,
        background: `linear-gradient(145deg, #ffffff 18%, ${color}12 100%)`,
        padding: 16,
        textAlign: 'left',
        cursor: disabled ? 'default' : 'pointer',
        boxShadow: `0 12px 30px rgba(15,23,42,0.08), 0 5px 18px ${color}18`,
        opacity: disabled ? 0.65 : 1,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <span className="prg-action-sheen" aria-hidden="true" />
      <ChevronRight className="prg-action-arrow" size={17} color={color} aria-hidden="true" />
      <div className="prg-action-icon" style={{ width: 42, height: 42, borderRadius: 14, background: color, color: '#fff', display: 'grid', placeItems: 'center', marginBottom: 12, boxShadow: `0 8px 20px ${color}42` }}>
        {icon}
      </div>
      <div style={{ position: 'relative', zIndex: 1, fontSize: 14, fontWeight: 900, color: '#0f172a', lineHeight: 1.15 }}>{title}</div>
      <div style={{ position: 'relative', zIndex: 1, fontSize: 11, fontWeight: 800, color, marginTop: 5, lineHeight: 1.3 }}>{subtitle}</div>
    </button>
  )
}

function VendorCard({ v, onClick }: { v: Vendedor; onClick: () => void }) {
  const isFav = useStore(s => s.favoritos.includes(v.id))
  const toggleFavorito = useStore(s => s.toggleFavorito)
  const abrirComTeclado = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={abrirComTeclado} className="prg-lift" style={{
      width: 286,
      flexShrink: 0,
      cursor: 'pointer',
      background: '#fff',
      borderRadius: 24,
      overflow: 'hidden',
      border: '1px solid #e2e8f0',
      boxShadow: cardShadow,
      textAlign: 'left',
      padding: 0,
    }}>
      <div style={{ height: 126, position: 'relative', background: v.gradiente }}>
        <img src={v.image} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }} alt={v.nome} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(15,23,42,0.62), rgba(15,23,42,0.08))' }} />
        <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: '#fff', color: '#0f172a', borderRadius: 999, padding: '5px 10px', fontSize: 10, fontWeight: 900 }}>
            {v.tipo === 'restaurante' ? 'Restaurante' : 'Ambulante'}
          </span>
          {v.aberto && <span style={{ background: '#16a34a', color: '#fff', borderRadius: 999, padding: '5px 9px', fontSize: 10, fontWeight: 900 }}>Aberto</span>}
        </div>
        <button
          aria-label={isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          onClick={(e) => { e.stopPropagation(); toggleFavorito(v.id) }}
          style={{ position: 'absolute', top: 10, right: 10, width: 36, height: 36, borderRadius: 13, border: 'none', background: 'rgba(255,255,255,0.94)', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 6px 16px rgba(15,23,42,0.16)' }}
        >
          <Heart size={17} color={isFav ? theme.color.danger : '#64748b'} fill={isFav ? theme.color.danger : 'none'} />
        </button>
        <div style={{ position: 'absolute', bottom: 12, left: 14, right: 14 }}>
          <div style={{ color: '#fff', fontWeight: 950, fontSize: 18, textShadow: '0 2px 8px rgba(0,0,0,0.32)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nome}</div>
        </div>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 800 }}>{v.categoria}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 900, color: '#ca8a04' }}>
            <Star size={12} fill="#fbbf24" color="#fbbf24" /> {v.avaliacao || 'Novo'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#64748b', fontWeight: 700 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#16a34a' }}><Clock size={12} />{v.tempo}</span>
          <span>{v.distancia}</span>
        </div>
      </div>
    </div>
  )
}

function ProdutoCard({ item, onAdd, added }: { item: ProdutoDestaque; onAdd: () => void; added: boolean }) {
  return (
    <div style={{ background: '#fff', borderRadius: 22, padding: 14, border: '1px solid #e2e8f0', boxShadow: '0 10px 26px rgba(15,23,42,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          {item.promocao && <div style={{ display: 'inline-flex', fontSize: 9, fontWeight: 950, color: '#fff', background: '#ea580c', borderRadius: 999, padding: '3px 7px', marginBottom: 6 }}>{item.promocao.selo}</div>}
          <div style={{ fontSize: 13, fontWeight: 900, color: '#0f172a', lineHeight: 1.25 }}>{item.nome}</div>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.vendedorNome}</div>
        </div>
        <div style={{ fontSize: 28, lineHeight: 1 }}>{item.emoji}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
        <div>
          {item.precoOriginal && (
            <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textDecoration: 'line-through' }}>R$ {item.precoOriginal.toFixed(2).replace('.', ',')}</div>
          )}
          <div style={{ fontSize: 16, fontWeight: 950, color: '#16a34a' }}>R$ {item.preco.toFixed(2).replace('.', ',')}</div>
        </div>
        <button onClick={onAdd} style={{
          height: 34,
          minWidth: 38,
          borderRadius: 12,
          border: `1px solid ${added ? '#16a34a' : '#dbeafe'}`,
          background: added ? '#16a34a' : '#eff6ff',
          color: added ? '#fff' : theme.color.primary,
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          fontWeight: 900,
        }}>
          {added ? <Check size={16} /> : <Plus size={16} />}
        </button>
      </div>
    </div>
  )
}

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <h3 style={{ fontSize: 19, fontWeight: 950, color: '#0f172a', margin: 0, letterSpacing: -0.3 }}>{title}</h3>
      {action && (
        <button onClick={onAction} style={{ border: 0, background: 'transparent', color: theme.color.primary, fontSize: 13, fontWeight: 900, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          {action}<ChevronRight size={14} />
        </button>
      )}
    </div>
  )
}

function iconButton(bg: string): React.CSSProperties {
  return {
    width: 40, height: 40, borderRadius: 14, border: '1px solid #e2e8f0',
    background: bg, display: 'grid', placeItems: 'center', cursor: 'pointer',
  }
}

export default function HomePage() {
  const navigate = useNavigate()
  const [busca, setBusca] = useState('')
  const [catSel, setCatSel] = useState<CategoriaId | null>(null)
  const [categoriasOpen, setCategoriasOpen] = useState(false)
  const [soFavoritos, setSoFavoritos] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [addedId, setAddedId] = useState<string | null>(null)
  const [cupons, setCupons] = useState<Cupom[]>([])

  const favoritos = useStore(s => s.favoritos)
  const naoLidas = useStore(s => s.notificacoes.filter(n => !n.lida).length)
  const marcarTodasLidas = useStore(s => s.marcarTodasLidas)
  const addItem = useStore(s => s.addItem)
  const catalogo = useCatalogo(s => s.vendedores)
  const loading = useCatalogo(s => s.loading)

  const restaurantes = useMemo(() => catalogo.filter(v => v.tipo === 'restaurante'), [catalogo])
  const ambulantes = useMemo(() => catalogo.filter(v => v.tipo === 'ambulante'), [catalogo])
  const todosProdutos = useMemo<ProdutoDestaque[]>(() => (
    catalogo.flatMap(v => v.produtos.map(p => ({ ...p, vendedorId: v.id, vendedorNome: v.nome })))
  ), [catalogo])
  const produtos = useMemo<ProdutoDestaque[]>(() => (
    todosProdutos
      .sort((a, b) => a.preco - b.preco)
      .slice(0, 4)
  ), [todosProdutos])

  const vendedores = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return catalogo.filter(v => {
      if (soFavoritos && !favoritos.includes(v.id)) return false
      if (catSel && !v.produtos.some(p => pertenceACategoria(p.categoria, catSel))) return false
      if (!termo) return true
      return (
        v.nome.toLowerCase().includes(termo) ||
        v.categoria.toLowerCase().includes(termo) ||
        v.produtos.some(p => p.nome.toLowerCase().includes(termo))
      )
    })
  }, [busca, catSel, soFavoritos, favoritos, catalogo])

  const produtoPromocao = useMemo(() => (
    todosProdutos
      .filter(p => !!p.promocao)
      .sort((a, b) => {
        const pa = a.promocao?.descontoValor ?? 0
        const pb = b.promocao?.descontoValor ?? 0
        return pb - pa
      })[0]
  ), [todosProdutos])
  const restaurantesLabel = restaurantes.length === 1 ? '1 disponível' : `${restaurantes.length} disponíveis`
  const ambulantesLabel = ambulantes.length === 1 ? '1 na praia' : `${ambulantes.length} na praia`
  const lojasLabel = catalogo.length === 1 ? '1 loja no app' : `${catalogo.length} lojas no app`

  useEffect(() => {
    async function carregarCupons() {
      const agora = new Date().toISOString()
      const { data } = await supabase
        .from('cupons')
        .select('*')
        .eq('ativo', true)
        .eq('publico', true)
        .or(`validade.is.null,validade.gte.${agora}`)
        .order('created_at', { ascending: false })
        .limit(6)

      setCupons(((data as Cupom[]) ?? []).filter(c => !c.limite_uso || c.usos < c.limite_uso))
    }

    carregarCupons()
    const ch = supabase.channel('cliente_cupons')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cupons' }, () => carregarCupons())
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [])

  function abrirNotif() {
    setNotifOpen(true)
    marcarTodasLidas()
  }

  function adicionar(item: ProdutoDestaque) {
    addItem(item.vendedorId, item.id, 1)
    setAddedId(item.id)
    setTimeout(() => setAddedId(curr => (curr === item.id ? null : curr)), 1100)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#0f172a', paddingBottom: 98 }}>
      {notifOpen && <NotifPanel onClose={() => setNotifOpen(false)} />}
      {categoriasOpen && (
        <CategoriasPanel
          catalogo={catalogo}
          selecionada={catSel}
          onClose={() => setCategoriasOpen(false)}
          onSelect={(categoriaId) => {
            setCatSel(categoriaId)
            setCategoriasOpen(false)
          }}
        />
      )}

      <header style={{ padding: '16px 18px 12px', position: 'sticky', top: 0, zIndex: 100, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(226,232,240,0.66)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 950, letterSpacing: -0.6, color: '#0f172a' }}>O que você quer agora?</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', marginTop: 2 }}>Comida, bebida e lojas perto da praia</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button aria-label="Filtrar favoritos" onClick={() => setSoFavoritos(v => !v)} style={iconButton(soFavoritos ? '#fff1f2' : '#f8fafc')}>
              <Heart size={19} color={soFavoritos ? theme.color.danger : '#64748b'} fill={soFavoritos ? theme.color.danger : 'none'} />
            </button>
            <button aria-label="Notificações" onClick={abrirNotif} style={{ ...iconButton('#f8fafc'), position: 'relative' }}>
              <Bell size={19} color="#64748b" />
              {naoLidas > 0 && <div style={{ position: 'absolute', top: 9, right: 9, width: 9, height: 9, background: theme.color.danger, borderRadius: '50%', border: '2px solid #fff' }} />}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 13, color: '#334155' }}>
          <MapPin size={16} color={theme.color.primary} />
          <span style={{ fontSize: 13, fontWeight: 800 }}>Praia Grande</span>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>lojas próximas a você</span>
        </div>

        <div style={{ position: 'relative' }}>
          <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar comida, bebida ou loja"
            aria-label="Buscar ambulantes, restaurantes e produtos"
            style={{ width: '100%', height: 50, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 18, padding: '0 44px 0 48px', fontSize: 14, fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
          />
          {busca && (
            <button aria-label="Limpar busca" onClick={() => setBusca('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', ...iconButton('#fff'), width: 32, height: 32, borderRadius: 11 }}>
              <X size={15} color="#0ea5e9" />
            </button>
          )}
        </div>
      </header>

      <main style={{ padding: '16px 18px 0' }}>
        {/* Vitrine de promoção: só aparece quando existe OFERTA REAL publicada */}
        {produtoPromocao && (
          <section style={{
            borderRadius: 30,
            padding: 20,
            color: '#fff',
            position: 'relative',
            overflow: 'hidden',
            background: 'linear-gradient(135deg,#0284c7 0%,#0ea5e9 46%,#16a34a 100%)',
            boxShadow: '0 22px 46px rgba(14,165,233,0.24)',
            marginBottom: 18,
          }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 88% 16%, rgba(255,255,255,0.34), transparent 22%), radial-gradient(circle at 74% 120%, rgba(251,191,36,0.38), transparent 32%)' }} />
            <div style={{ position: 'relative', zIndex: 1, maxWidth: 260 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '6px 10px', background: 'rgba(255,255,255,0.18)', fontSize: 11, fontWeight: 950, marginBottom: 12 }}>
                <Percent size={13} /> Promoções da praia
              </div>
              <h1 style={{ margin: 0, fontSize: 25, fontWeight: 950, lineHeight: 1.05, letterSpacing: -0.7 }}>{produtoPromocao.promocao?.titulo || produtoPromocao.nome}</h1>
              <p style={{ margin: '8px 0 16px', fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
                {produtoPromocao.nome} em {produtoPromocao.vendedorNome}
                {produtoPromocao.precoOriginal ? ` de R$ ${produtoPromocao.precoOriginal.toFixed(2).replace('.', ',')}` : ''} por R$ {produtoPromocao.preco.toFixed(2).replace('.', ',')}.
              </p>
              <button onClick={() => navigate(`/pedir?v=${produtoPromocao.vendedorId}`)} style={{ border: 0, background: '#fff', color: '#0284c7', borderRadius: 15, padding: '12px 16px', fontSize: 13, fontWeight: 950, cursor: 'pointer', boxShadow: '0 10px 24px rgba(15,23,42,0.16)' }}>
                Ver oferta
              </button>
            </div>
            <div style={{ position: 'absolute', right: 12, bottom: 12, width: 110, height: 110, borderRadius: 35, background: 'rgba(255,255,255,0.18)', display: 'grid', placeItems: 'center', fontSize: 50 }}>
              {produtoPromocao.emoji || '🏖️'}
            </div>
          </section>
        )}

        <section className="prg-stagger" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          <QuickAction title="Restaurantes perto" subtitle={restaurantesLabel} color="#f97316" icon={<Utensils size={21} />} onClick={() => navigate('/pedir?tipo=restaurante')} />
          <QuickAction title="Ambulantes perto" subtitle={ambulantesLabel} color="#16a34a" icon={<ShoppingBag size={21} />} onClick={() => navigate('/pedir?tipo=ambulante')} />
          <QuickAction title="Cupons" subtitle={`${cupons.length} ativo${cupons.length === 1 ? '' : 's'}`} color="#7c3aed" icon={<Ticket size={21} />} onClick={() => document.getElementById('cupons')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
          <QuickAction title="Lojas perto de você" subtitle={lojasLabel} color="#0284c7" icon={<Store size={21} />} onClick={() => navigate('/pedir')} />
        </section>

        <section style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: 19, fontWeight: 950, color: '#0f172a', margin: 0 }}>Categorias</h3>
              {catSel && (
                <span style={{ display: 'block', marginTop: 3, color: '#64748b', fontSize: 10, fontWeight: 800 }}>
                  Filtro: {CATEGORIAS.find(categoria => categoria.id === catSel)?.nome}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {catSel && (
                <button type="button" onClick={() => setCatSel(null)} style={{ border: 0, background: 'transparent', color: '#64748b', padding: '8px 6px', fontSize: 11, fontWeight: 900, cursor: 'pointer' }}>
                  Limpar
                </button>
              )}
              <button type="button" onClick={() => setCategoriasOpen(true)} style={{ minHeight: 36, border: '1px solid #bae6fd', borderRadius: 11, background: '#e0f2fe', color: '#0369a1', padding: '0 11px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 950, cursor: 'pointer' }}>
                <Grid2X2 size={15} aria-hidden="true" /> Todos
              </button>
            </div>
          </div>
          <div className="prg-category-strip" style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '2px 1px 8px', scrollbarWidth: 'none', scrollSnapType: 'x proximity' }}>
            {CATEGORIAS.filter(cat => CATEGORIAS_DESTAQUE.includes(cat.id)).map(cat => {
              const sel = catSel === cat.id
              const count = catalogo.filter(v => v.produtos.some(p => pertenceACategoria(p.categoria, cat.id))).length
              return (
                <button
                  key={cat.id}
                  type="button"
                  aria-pressed={sel}
                  aria-label={`Filtrar por ${cat.nome}: ${count} ${count === 1 ? 'loja' : 'lojas'}`}
                  className="prg-category-chip"
                  onClick={() => setCatSel(sel ? null : cat.id)}
                  style={{
                  flexShrink: 0,
                  width: 146,
                  minHeight: 76,
                  borderRadius: 16,
                  border: `1px solid ${sel ? cat.cor : `${cat.cor}35`}`,
                  background: sel ? `${cat.cor}12` : '#fff',
                  position: 'relative',
                  overflow: 'hidden',
                  padding: '11px 9px 10px 12px',
                  cursor: 'pointer',
                  boxShadow: sel ? `0 12px 25px ${cat.cor}38` : `0 8px 20px rgba(15,23,42,0.06), 0 3px 10px ${cat.cor}12`,
                  textAlign: 'left',
                  scrollSnapAlign: 'start',
                }}>
                  <span style={{ position: 'relative', zIndex: 1, display: 'block', maxWidth: '62%', fontSize: 12, fontWeight: 950, color: '#0f172a', lineHeight: 1.15 }}>{cat.nome}</span>
                  <span style={{ position: 'absolute', zIndex: 1, left: 12, bottom: 10, display: 'block', fontSize: 10, fontWeight: 850, color: sel ? cat.cor : '#64748b', whiteSpace: 'nowrap' }}>
                    {count} {count === 1 ? 'loja' : 'lojas'}
                  </span>
                  <CategoryPhoto categoria={cat} className="prg-category-photo-small" />
                </button>
              )
            })}
          </div>
        </section>

        <section id="cupons" style={{ marginBottom: 26 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            {cupons.length === 0 ? (
              <div style={{ borderRadius: 24, padding: 16, background: '#fff7ed', border: '1px dashed #fb923c', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: 17, background: '#fed7aa', color: '#c2410c', display: 'grid', placeItems: 'center' }}>
                  <Ticket size={24} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 950, color: '#9a3412' }}>Cupons PraiaGo</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#c2410c', marginTop: 3 }}>
                    Nenhum cupom ativo agora. Quando uma loja liberar desconto, aparece aqui.
                  </div>
                </div>
              </div>
            ) : cupons.map(c => {
              const desconto = c.tipo === 'frete_gratis'
                ? 'Frete gratis'
                : c.tipo === 'percentual'
                  ? `${Number(c.valor)}% OFF`
                  : `R$ ${Number(c.valor).toFixed(2).replace('.', ',')} OFF`

              return (
                <button
                  key={c.id}
                  onClick={() => navigator.clipboard?.writeText(c.codigo).catch(() => {})}
                  style={{ borderRadius: 24, padding: 16, background: '#fff7ed', border: '1px dashed #fb923c', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', cursor: 'pointer' }}
                >
                  <div style={{ width: 50, height: 50, borderRadius: 18, background: '#fed7aa', color: '#c2410c', display: 'grid', placeItems: 'center' }}>
                    <Ticket size={24} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 950, color: '#9a3412' }}>{c.titulo}</span>
                      <span style={{ fontSize: 11, fontWeight: 950, color: '#fff', background: '#ea580c', padding: '4px 8px', borderRadius: 999 }}>{desconto}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#c2410c', marginTop: 5 }}>
                      Use {c.codigo}{c.valor_minimo > 0 ? ` · minimo R$ ${Number(c.valor_minimo).toFixed(2).replace('.', ',')}` : ''}
                    </div>
                    {c.validade && <div style={{ fontSize: 10, color: '#9a3412', fontWeight: 700, marginTop: 3 }}>Valido ate {new Date(c.validade).toLocaleDateString('pt-BR')}</div>}
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section style={{ marginBottom: 26 }}>
          <SectionHeader title={soFavoritos ? 'Seus favoritos' : catSel || busca ? 'Resultado da busca' : 'Lojas perto de você'} action="Ver todas" onAction={() => navigate('/pedir')} />
          {loading ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {[0, 1].map(i => <div key={i} className="shimmer" style={{ height: 124, borderRadius: 24 }} />)}
            </div>
          ) : vendedores.length === 0 ? (
            <div style={{ borderRadius: 24, border: '1px solid #e2e8f0', background: '#f8fafc', padding: 24, textAlign: 'center', color: '#64748b' }}>
              <Search size={30} color="#cbd5e1" style={{ margin: '0 auto 10px' }} />
              <div style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>Nenhuma loja real disponível ainda</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 5 }}>Quando um restaurante ou ambulante publicar cardápio, ele aparece aqui.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '0 2px 6px', scrollbarWidth: 'none' }}>
              {vendedores.map(v => <VendorCard key={v.id} v={v} onClick={() => navigate(`/pedir?v=${v.id}`)} />)}
            </div>
          )}
        </section>

        {restaurantes.length > 0 && (
          <section style={{ marginBottom: 26 }}>
            <SectionHeader title="Restaurantes próximos" action="Abrir" onAction={() => navigate('/pedir?tipo=restaurante')} />
            <div style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '0 2px 6px', scrollbarWidth: 'none' }}>
              {restaurantes.slice(0, 5).map(v => <VendorCard key={v.id} v={v} onClick={() => navigate(`/pedir?v=${v.id}`)} />)}
            </div>
          </section>
        )}

        {ambulantes.length > 0 && (
          <section style={{ marginBottom: 26 }}>
            <SectionHeader title="Ambulantes na areia" action="Abrir" onAction={() => navigate('/pedir?tipo=ambulante')} />
            <div style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '0 2px 6px', scrollbarWidth: 'none' }}>
              {ambulantes.slice(0, 5).map(v => <VendorCard key={v.id} v={v} onClick={() => navigate(`/pedir?v=${v.id}`)} />)}
            </div>
          </section>
        )}

        {produtos.length > 0 && (
          <section style={{ marginBottom: 26 }}>
            <SectionHeader title="Produtos em destaque" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {produtos.map(item => (
                <ProdutoCard key={item.id} item={item} added={addedId === item.id} onAdd={() => adicionar(item)} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
