import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Grid2X2, Heart, MapPin, Percent, Plus,
  Search, ShoppingBag, SlidersHorizontal, Star, Ticket, Utensils, X,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BannerEventos, CartaoLocal, CARTAO } from '../components/ui'
import {
  CATEGORIAS,
  pertenceACategoria,
  semAcento,
  type CategoriaId,
  type Produto,
  type Vendedor,
} from '../lib/catalogo'
import { useCatalogo } from '../store/useCatalogo'
import SeletorRegiao from '../components/SeletorRegiao'
import { useGPS } from '../hooks/useGPS'
import { TEXTO_AREA_ATENDIDA, CENTROS_CIDADES, type CidadeAtendida } from '../lib/serviceArea'
import { useStore } from '../store/useStore'
import { theme } from '../lib/theme'
import { supabase } from '../lib/supabase'
import CuponsPanel from '../components/CuponsPanel'
import { useCatalogoRegiao } from '../hooks/useCatalogoRegiao'
import CatalogFeedback from '../components/CatalogFeedback'

type ProdutoDestaque = Produto & { vendedorId: string; vendedorNome: string }
/** Só o que a faixa "em destaque" da Home precisa do evento. */
type EventoDestaque = {
  id: string
  titulo: string
  categoria: string | null
  local_nome: string | null
  data: string | null
  hora: string | null
  imagem_url: string | null
}
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
const CATEGORY_SPRITE = '/images/categorias-comida-v1.webp'
const CATEGORIAS_DESTAQUE: readonly CategoriaId[] = ['bebidas', 'bebidas_alcoolicas', 'espetos', 'salgados', 'porcoes', 'almoco', 'acai']

function NotifPanel({ onClose }: { onClose: () => void }) {
  const notificacoes = useStore(s => s.notificacoes)
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '76px 16px 0' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, background: 'var(--pg-surface)', borderRadius: 24, overflow: 'hidden', boxShadow: theme.shadow.float, border: '1px solid var(--pg-line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid var(--pg-surface-alt)' }}>
          <h3 style={{ fontSize: 17, fontWeight: 900, color: 'var(--pg-ink)', margin: 0 }}>Notificações</h3>
          <button aria-label="Fechar" onClick={onClose} style={iconButton('var(--pg-surface-alt)')}><X size={18} color="var(--pg-muted)" /></button>
        </div>
        {notificacoes.length === 0 ? (
          <div style={{ padding: '42px 20px', textAlign: 'center', color: 'var(--pg-muted)' }}>
            <Bell size={32} color="var(--pg-faint)" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 14, fontWeight: 700 }}>Nada novo por enquanto</div>
          </div>
        ) : notificacoes.map(n => (
          <div key={n.id} style={{ padding: '14px 18px', borderBottom: '1px solid var(--pg-surface-alt)', display: 'flex', gap: 12, background: n.lida ? 'var(--pg-surface)' : 'var(--pg-brand-soft)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.lida ? 'var(--pg-line)' : theme.color.primary, flexShrink: 0, marginTop: 6 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--pg-ink)' }}>{n.titulo}</div>
              <div style={{ fontSize: 13, color: 'var(--pg-muted)', marginTop: 2, lineHeight: 1.4 }}>{n.texto}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CategoryPhoto({ categoria, className }: { categoria: Categoria; className?: string }) {
  const [coluna, linha] = categoria.sprite
  const image = 'image' in categoria ? categoria.image : null
  const zoom = 1.25
  const posicaoX = ((coluna * zoom + (zoom - 1) / 2) / (5 * zoom - 1)) * 100
  const posicaoY = ((linha * zoom + (zoom - 1) / 2) / (6 * zoom - 1)) * 100
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: 'block',
        backgroundImage: `url(${image || CATEGORY_SPRITE})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: image ? 'contain' : `${5 * zoom * 100}% ${6 * zoom * 100}%`,
        backgroundPosition: image ? 'center' : `${posicaoX}% ${posicaoY}%`,
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
  const [buscaCategoria, setBuscaCategoria] = useState('')

  // Busca sem acento: "acai" tem que achar "Açaí", senão o campo parece quebrado.
  const categoriasFiltradas = useMemo(() => {
    const termo = semAcento(buscaCategoria)
    if (!termo) return CATEGORIAS
    return CATEGORIAS.filter(c =>
      semAcento(c.nome).includes(termo)
      || c.aliases.some(a => a.includes(termo)),
    )
  }, [buscaCategoria])

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
        style={{ width: '100%', maxWidth: 620, height: 'min(88dvh, 780px)', overflowY: 'auto', background: 'var(--pg-surface-alt)', borderRadius: '24px 24px 0 0', boxShadow: '0 -18px 52px rgba(15,23,42,0.22)' }}
      >
        {/* Cabeçalho com a cena de praia, igual à Home e à tela de Eventos */}
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'rgba(var(--pg-surface-rgb), 0.97)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--pg-line)', overflow: 'hidden' }}>
          <img src="/images/home-beach-v2.webp" alt="" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: 132, objectFit: 'cover', objectPosition: 'center', opacity: 0.48, pointerEvents: 'none' }} />
          <span aria-hidden="true" style={{ position: 'absolute', inset: 0, height: 132, background: 'linear-gradient(90deg, var(--pg-surface) 0%, rgba(var(--pg-surface-rgb), 0.92) 42%, rgba(var(--pg-surface-rgb), 0.3) 100%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '44px 1fr 44px', alignItems: 'center', padding: '10px 14px 4px' }}>
            <button type="button" aria-label="Fechar categorias" onClick={onClose} style={{ ...iconButton('var(--pg-surface)'), borderRadius: 13 }}>
              <ChevronLeft size={21} color="var(--pg-ink)" />
            </button>
            <h2 id="categorias-title" style={{ margin: 0, textAlign: 'center', fontSize: 21, fontWeight: 950, color: 'var(--pg-ink)', letterSpacing: 0 }}>Todos</h2>
            <span />
          </div>
          <p style={{ position: 'relative', zIndex: 1, margin: '0 0 12px', textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--pg-muted)' }}>
            Comidas e bebidas perto da praia
          </p>

          <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 9, padding: '0 14px 12px' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <Search size={17} color="var(--pg-faint)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                value={buscaCategoria}
                onChange={e => setBuscaCategoria(e.target.value)}
                placeholder="Buscar categoria"
                aria-label="Buscar categoria"
                style={{ width: '100%', height: 48, background: 'var(--pg-surface)', border: '1px solid var(--pg-line)', borderRadius: 16, padding: '0 14px 0 42px', fontSize: 13.5, fontWeight: 700, outline: 'none', boxSizing: 'border-box', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}
              />
            </div>
            <span style={{ ...CARTAO, flexShrink: 0, width: 48, height: 48, display: 'grid', placeItems: 'center', borderRadius: 16 }}>
              <SlidersHorizontal size={19} color="var(--pg-success)" strokeWidth={2.4} />
            </span>
          </div>
        </div>

        <div className="prg-category-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 11, padding: '14px 14px 112px' }}>
          {categoriasFiltradas.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 20px', color: 'var(--pg-muted)' }}>
              <Search size={28} color="var(--pg-faint)" style={{ margin: '0 auto 10px' }} />
              <div style={{ fontSize: 14.5, fontWeight: 900, color: 'var(--pg-ink)' }}>Nenhuma categoria com esse nome</div>
            </div>
          ) : categoriasFiltradas.map(categoria => {
            const selecionadaAgora = selecionada === categoria.id
            const restrita = 'ageRestricted' in categoria && categoria.ageRestricted
            const count = catalogo.filter(vendedor => vendedor.produtos.some(produto => pertenceACategoria(produto.categoria, categoria.id))).length
            return (
              <button
                key={categoria.id}
                type="button"
                aria-pressed={selecionadaAgora}
                aria-label={`${categoria.nome}: ${count} ${count === 1 ? 'loja' : 'lojas'}`}
                onClick={() => onSelect(categoria.id)}
                className="prg-category-tile"
                style={{ position: 'relative', minHeight: 128, overflow: 'hidden', borderRadius: 18, border: `1px solid ${selecionadaAgora ? categoria.cor : 'var(--pg-line)'}`, background: 'var(--pg-surface)', padding: '13px 10px 12px 13px', textAlign: 'left', cursor: 'pointer', boxShadow: selecionadaAgora ? `0 12px 26px -12px ${categoria.cor}` : '0 1px 2px rgba(15,23,42,0.04), 0 10px 24px -16px rgba(15,23,42,0.28)' }}
              >
                {/* Chip colorido com a inicial — o mockup traz um ícone por
                    categoria, mas não existe um ícone próprio no catálogo e
                    inventar 20 ícones deixaria metade sem sentido. */}
                <span style={{ position: 'relative', zIndex: 1, display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 11, marginBottom: 9, background: `${categoria.cor}18`, color: categoria.cor, fontSize: 15, fontWeight: 950 }}>
                  {restrita ? '18+' : categoria.nome.charAt(0)}
                </span>
                <span style={{ position: 'relative', zIndex: 1, display: 'block', maxWidth: restrita ? '50%' : '62%', fontSize: restrita ? 13.5 : 14.5, fontWeight: 950, color: 'var(--pg-ink)', lineHeight: 1.15, letterSpacing: 0 }}>{categoria.nome}</span>
                <span style={{ position: 'absolute', zIndex: 1, left: 13, bottom: restrita ? 4 : 12, padding: '3px 8px', borderRadius: 999, fontSize: 9.5, fontWeight: 900, color: selecionadaAgora ? 'var(--pg-ink)' : 'var(--pg-muted)', background: selecionadaAgora ? `${categoria.cor}18` : 'var(--pg-surface-alt)' }}>
                  {count} {count === 1 ? 'loja' : 'lojas'}
                </span>
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
  title, subtitle, count, icon, color, onClick, disabled,
}: {
  title: string
  subtitle: string
  count?: string
  icon: React.ReactNode
  color: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      aria-label={`${title}: ${subtitle}${count ? `, ${count}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      className={disabled ? 'prg-action-card' : 'prg-action-card prg-lift'}
      style={{
        ...CARTAO,
        minHeight: 88,
        padding: 12,
        textAlign: 'left',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.65 : 1,
        position: 'relative',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: '46px minmax(0, 1fr)',
        alignItems: 'center',
        gap: 9,
      }}
    >
      <span className="prg-action-sheen" aria-hidden="true" />
      <div
        className="prg-action-icon"
        style={{
          width: 46, height: 46, borderRadius: 15,
          background: color,
          color: 'var(--pg-on-brand)', display: 'grid', placeItems: 'center',
          boxShadow: `0 12px 24px -10px ${color}`,
        }}
      >
        {icon}
      </div>
      <div style={{ position: 'relative', zIndex: 1, minWidth: 0, paddingRight: 5 }}>
        <div style={{ fontSize: 12.5, fontWeight: 850, color: 'var(--pg-ink)', lineHeight: 1.2 }}>{title}</div>
        <div style={{ fontSize: 10.25, fontWeight: 700, color: 'var(--pg-muted)', marginTop: 3, lineHeight: 1.25 }}>{subtitle}</div>
        {count && (
          <span style={{ display: 'inline-block', marginTop: 7, padding: '3px 7px', borderRadius: 999, fontSize: 9, fontWeight: 750, color: 'var(--pg-ink)', background: `${color}14` }}>
            {count}
          </span>
        )}
      </div>
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
      background: 'var(--pg-surface)',
      borderRadius: 24,
      overflow: 'hidden',
      border: '1px solid var(--pg-line)',
      boxShadow: cardShadow,
      textAlign: 'left',
      padding: 0,
    }}>
      <div style={{ height: 126, position: 'relative', background: v.gradiente }}>
        <img src={v.image} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }} alt={v.nome} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(15,23,42,0.62), rgba(15,23,42,0.08))' }} />
        <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: 'var(--pg-surface)', color: 'var(--pg-ink)', borderRadius: 999, padding: '5px 10px', fontSize: 10, fontWeight: 900 }}>
            {v.tipo === 'restaurante' ? 'Restaurante' : 'Ambulante'}
          </span>
          {!v.localizacaoConfirmada
            ? <span style={{ background: '#f59e0b', color: 'var(--pg-on-brand)', borderRadius: 999, padding: '5px 9px', fontSize: 10, fontWeight: 900 }}>Local em ajuste</span>
            : v.aberto && <span style={{ background: '#16a34a', color: 'var(--pg-on-brand)', borderRadius: 999, padding: '5px 9px', fontSize: 10, fontWeight: 900 }}>Aberto</span>}
        </div>
        <button
          aria-label={isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          onClick={(e) => { e.stopPropagation(); toggleFavorito(v.id) }}
          style={{ position: 'absolute', top: 10, right: 10, width: 36, height: 36, borderRadius: 13, border: 'none', background: 'rgba(var(--pg-surface-rgb), 0.94)', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 6px 16px rgba(15,23,42,0.16)' }}
        >
          <Heart size={17} color={isFav ? theme.color.danger : 'var(--pg-muted)'} fill={isFav ? theme.color.danger : 'none'} />
        </button>
        <div style={{ position: 'absolute', bottom: 12, left: 14, right: 14 }}>
          <div style={{ color: 'var(--pg-on-brand)', fontWeight: 950, fontSize: 18, textShadow: '0 2px 8px rgba(0,0,0,0.32)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nome}</div>
        </div>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
          <span style={{ fontSize: 12, color: 'var(--pg-muted)', fontWeight: 800 }}>{v.categoria}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 900, color: 'var(--pg-warning)' }}>
            <Star size={12} fill="#fbbf24" color="#fbbf24" /> {v.avaliacao || 'Novo'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--pg-muted)', fontWeight: 700 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: v.localizacaoConfirmada ? 'var(--pg-success)' : 'var(--pg-warning)' }}><Clock size={12} />{v.localizacaoConfirmada ? v.tempo : 'Cardapio disponivel'}</span>
          <span>{v.distancia}</span>
        </div>
        {/* Endereço fixo da loja. Ficava só no banco: o restaurante cadastrava e
            o cliente nunca via, porque a tabela que o app lê não trazia a
            coluna. Ambulante não tem — ele é achado pelo GPS ao vivo. */}
        {v.endereco && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 7, fontSize: 11.5, color: 'var(--pg-muted)', fontWeight: 700, lineHeight: 1.35 }}>
            <MapPin size={12} color="var(--pg-success)" strokeWidth={2.6} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {v.endereco}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function ProdutoCard({ item, onAdd, added }: { item: ProdutoDestaque; onAdd: () => void; added: boolean }) {
  return (
    <div style={{ background: 'var(--pg-surface)', borderRadius: 22, padding: 14, border: '1px solid var(--pg-line)', boxShadow: '0 10px 26px rgba(15,23,42,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          {item.promocao && <div style={{ display: 'inline-flex', fontSize: 9, fontWeight: 950, color: 'var(--pg-on-brand)', background: '#ea580c', borderRadius: 999, padding: '3px 7px', marginBottom: 6 }}>{item.promocao.selo}</div>}
          <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--pg-ink)', lineHeight: 1.25 }}>{item.nome}</div>
          <div style={{ fontSize: 10, color: 'var(--pg-muted)', fontWeight: 700, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.vendedorNome}</div>
        </div>
        <div style={{ fontSize: 28, lineHeight: 1 }}>{item.emoji}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
        <div>
          {item.precoOriginal && (
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--pg-faint)', textDecoration: 'line-through' }}>R$ {item.precoOriginal.toFixed(2).replace('.', ',')}</div>
          )}
          <div style={{ fontSize: 16, fontWeight: 950, color: 'var(--pg-success)' }}>R$ {item.preco.toFixed(2).replace('.', ',')}</div>
        </div>
        <button onClick={onAdd} style={{
          height: 34,
          minWidth: 38,
          borderRadius: 12,
          border: `1px solid ${added ? '#16a34a' : 'var(--pg-line)'}`,
          background: added ? '#16a34a' : 'var(--pg-brand-soft)',
          color: added ? 'var(--pg-on-brand)' : theme.color.primary,
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
      <h3 style={{ fontSize: 19, fontWeight: 950, color: 'var(--pg-ink)', margin: 0, letterSpacing: 0 }}>{title}</h3>
      {action && (
        <button onClick={onAction} style={{ border: 0, background: 'transparent', color: theme.color.primary, fontSize: 13, fontWeight: 900, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          {action}<ChevronRight size={14} />
        </button>
      )}
    </div>
  )
}

/** "sáb., 17 de ago." — mesma formatação da tela de Eventos. */
function fmtDataCurta(d: string | null) {
  if (!d) return ''
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
  } catch {
    return d
  }
}

function iconButton(bg: string): React.CSSProperties {
  return {
    width: 40, height: 40, borderRadius: 14, border: '1px solid var(--pg-line)',
    background: bg, display: 'grid', placeItems: 'center', cursor: 'pointer',
  }
}

export default function HomePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const resultsRef = useRef<HTMLDivElement>(null)
  const [busca, setBusca] = useState('')
  const [catSel, setCatSel] = useState<CategoriaId | null>(null)
  const [categoriasOpen, setCategoriasOpen] = useState(false)
  const soFavoritos = searchParams.get('filtro') === 'favoritos'
  const setSoFavoritos = () => setSearchParams(params => { if (soFavoritos) params.delete('filtro'); else params.set('filtro', 'favoritos'); return params }, { replace: true })
  const [notifOpen, setNotifOpen] = useState(false)
  const [addedId, setAddedId] = useState<string | null>(null)
  const [cupons, setCupons] = useState<Cupom[]>([])
  const [cuponsAberto, setCuponsAberto] = useState(false)
  const [eventoDestaque, setEventoDestaque] = useState<EventoDestaque | null>(null)

  const favoritos = useStore(s => s.favoritos)
  const marcarTodasLidas = useStore(s => s.marcarTodasLidas)
  const addItem = useStore(s => s.addItem)
  const [regiaoAberta, setRegiaoAberta] = useState(false)
  const { cidadeAtendida, definirPosicaoManual } = useGPS()
  const catalogo = useCatalogo(s => s.vendedores)
  const loading = useCatalogo(s => s.loading)
  const catalogError = useCatalogo(s => s.error)
  useEffect(() => {
    const panel = searchParams.get('painel')
    if (!panel) return
    if (panel === 'notificacoes') { setNotifOpen(true); marcarTodasLidas() }
    if (panel === 'cupons') setCuponsAberto(true)
    if (panel === 'regiao') setRegiaoAberta(true)
    setSearchParams(params => { params.delete('painel'); return params }, { replace: true })
  }, [searchParams, setSearchParams, marcarTodasLidas])
  useEffect(() => { if (soFavoritos && !loading) resultsRef.current?.scrollIntoView({ block: 'start' }) }, [soFavoritos, loading])

  // A regiao escolhida no seletor manda na lista. Nao mostramos vendedor de
  // outra cidade fingindo estar perto: lista vazia com aviso honesto e melhor
  // do que resultado que nunca vai entregar.
  // Regra por tipo: ver useCatalogoRegiao. Restaurante alcanca 15 km,
  // ambulante so a propria cidade.
  const { vendedores: catalogoDaRegiao, regiaoSemVendedor: semVendedor } = useCatalogoRegiao()

  const regiaoSemVendedor = semVendedor


  const restaurantes = useMemo(() => catalogoDaRegiao.filter(v => v.tipo === 'restaurante'), [catalogoDaRegiao])
  const ambulantes = useMemo(() => catalogoDaRegiao.filter(v => v.tipo === 'ambulante'), [catalogoDaRegiao])
  const todosProdutos = useMemo<ProdutoDestaque[]>(() => (
    catalogoDaRegiao.flatMap(v => v.produtos.map(p => ({ ...p, vendedorId: v.id, vendedorNome: v.nome })))
  ), [catalogoDaRegiao])
  const produtos = useMemo<ProdutoDestaque[]>(() => (
    todosProdutos
      .sort((a, b) => a.preco - b.preco)
      .slice(0, 4)
  ), [todosProdutos])

  const vendedores = useMemo(() => {
    // Busca sem acento dos dois lados: quem digita "acai" no celular (teclado sem
    // acento) tem que achar "Açaí". So baixar a caixa nao resolve, porque
    // 'açaí'.includes('acai') e false.
    const termo = semAcento(busca)
    return catalogoDaRegiao.filter(v => {
      if (soFavoritos && !favoritos.includes(v.id)) return false
      if (catSel && !v.produtos.some(p => pertenceACategoria(p.categoria, catSel))) return false
      if (!termo) return true
      return (
        semAcento(v.nome).includes(termo) ||
        semAcento(v.categoria).includes(termo) ||
        v.produtos.some(p => semAcento(p.nome).includes(termo))
      )
    })
  }, [busca, catSel, soFavoritos, favoritos, catalogoDaRegiao])

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

  // Evento em destaque da Home. Mesma regra da tela de Eventos (status ativo +
  // flag destaque), pegando o mais próximo por data. Se não houver nenhum, o
  // estado fica null e a faixa simplesmente não é renderizada.
  useEffect(() => {
    async function carregarDestaque() {
      const { data } = await supabase
        .from('eventos')
        .select('id,titulo,categoria,local_nome,data,hora,imagem_url')
        .eq('status', 'ativo')
        .eq('destaque', true)
        .order('data', { ascending: true, nullsFirst: false })
        .limit(1)

      setEventoDestaque(((data as EventoDestaque[]) ?? [])[0] ?? null)
    }

    carregarDestaque()
    const ch = supabase.channel('cliente_home_eventos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos' }, () => carregarDestaque())
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [])

  function adicionar(item: ProdutoDestaque) {
    addItem(item.vendedorId, item.id, 1)
    setAddedId(item.id)
    setTimeout(() => setAddedId(curr => (curr === item.id ? null : curr)), 1100)
  }

  return (
    <div className="pg-home" style={{ minHeight: '100%', background: 'var(--pg-sand)', color: 'var(--pg-ink)', paddingBottom: 24 }}>
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

      <header style={{ position: 'relative', minHeight: 176, padding: '20px 20px 18px', overflow: 'hidden', background: 'var(--pg-surface)', margin: '12px 16px', borderRadius: 24, border: '1px solid var(--pg-line)' }}>
        <img
          src="/images/home-beach-v2.webp"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', pointerEvents: 'none' }}
        />
        <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, var(--pg-surface) 0%, rgba(var(--pg-surface-rgb), 0.96) 30%, rgba(var(--pg-surface-rgb), 0.48) 58%, rgba(var(--pg-surface-rgb), 0) 82%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
            <span className="pg-eyebrow">SEU DIA, MAIS LEVE</span>
            <button aria-label="Filtrar favoritos" aria-pressed={soFavoritos} onClick={setSoFavoritos} style={iconButton(soFavoritos ? 'var(--pg-danger-bg)' : 'var(--pg-surface)')}>
              <Heart size={19} color={soFavoritos ? theme.color.danger : 'var(--pg-muted)'} fill={soFavoritos ? theme.color.danger : 'none'} />
            </button>
          </div>

          <h1 style={{ margin: 0, fontSize: 27.5, fontWeight: 950, letterSpacing: 0, lineHeight: 1.08, color: 'var(--pg-ink)', maxWidth: '76%' }}>
            Aproveite a praia.
            <br />
            <span
              style={{
                background: 'linear-gradient(100deg, var(--pg-ocean-dark), var(--pg-ocean) 45%, var(--pg-success))',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              Descubra aqui.
            </span>
          </h1>
          <p style={{ margin: '9px 0 0', maxWidth: '68%', fontSize: 13.5, fontWeight: 700, color: 'var(--pg-muted)', lineHeight: 1.4 }}>
            Comida, bebida e eventos perto da praia.
          </p>
        </div>
      </header>

      <div style={{ padding: '4px 18px 0', display: 'grid', gap: 12 }}>
        <CartaoLocal
          cidade={cidadeAtendida ?? 'Baixada Santista'}
          descricao={cidadeAtendida ? 'Toque para trocar de região' : TEXTO_AREA_ATENDIDA}
          onClick={() => setRegiaoAberta(true)}
        />

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <Search size={18} color="var(--pg-faint)" style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar comida ou vendedor"
              aria-label="Buscar ambulantes, restaurantes e produtos"
              style={{ width: '100%', height: 52, background: 'var(--pg-surface)', border: '1px solid var(--pg-line)', borderRadius: 18, padding: '0 44px 0 48px', fontSize: 14, fontWeight: 700, outline: 'none', boxSizing: 'border-box', boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 26px -16px rgba(15,23,42,0.2)' }}
            />
            {busca && (
              <button aria-label="Limpar busca" onClick={() => setBusca('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', ...iconButton('var(--pg-surface-alt)'), width: 32, height: 32, borderRadius: 11 }}>
                <X size={15} color="var(--pg-ocean-dark)" />
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label="Abrir categorias"
            onClick={() => setCategoriasOpen(true)}
            style={{ ...CARTAO, flexShrink: 0, width: 52, height: 52, display: 'grid', placeItems: 'center', cursor: 'pointer' }}
          >
            <SlidersHorizontal size={20} color="var(--pg-success)" strokeWidth={2.4} />
          </button>
        </div>

      </div>
      <CatalogFeedback/>

      <main style={{ padding: '16px 18px 0' }}>
        {/* Vitrine de promoção: só aparece quando existe OFERTA REAL publicada */}
        {produtoPromocao && (
          <section style={{
            borderRadius: 30,
            padding: 20,
            color: 'var(--pg-on-brand)',
            position: 'relative',
            overflow: 'hidden',
            background: 'linear-gradient(135deg,#0284c7 0%,#0ea5e9 46%,#16a34a 100%)',
            boxShadow: '0 22px 46px rgba(var(--pg-ocean-rgb), 0.24)',
            marginBottom: 18,
          }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 88% 16%, rgba(255,255,255,0.34), transparent 22%), radial-gradient(circle at 74% 120%, rgba(var(--pg-warning-rgb), 0.38), transparent 32%)' }} />
            <div style={{ position: 'relative', zIndex: 1, maxWidth: 260 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '6px 10px', background: 'rgba(255,255,255,0.18)', fontSize: 11, fontWeight: 950, marginBottom: 12 }}>
                <Percent size={13} /> Promoções da praia
              </div>
              <h1 style={{ margin: 0, fontSize: 25, fontWeight: 950, lineHeight: 1.05, letterSpacing: 0 }}>{produtoPromocao.promocao?.titulo || produtoPromocao.nome}</h1>
              <p style={{ margin: '8px 0 16px', fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
                {produtoPromocao.nome} em {produtoPromocao.vendedorNome}
                {produtoPromocao.precoOriginal ? ` de R$ ${produtoPromocao.precoOriginal.toFixed(2).replace('.', ',')}` : ''} por R$ {produtoPromocao.preco.toFixed(2).replace('.', ',')}.
              </p>
              <button onClick={() => navigate(`/pedir?v=${produtoPromocao.vendedorId}`)} style={{ border: 0, background: 'var(--pg-surface)', color: 'var(--pg-ocean-dark)', borderRadius: 15, padding: '12px 16px', fontSize: 13, fontWeight: 950, cursor: 'pointer', boxShadow: '0 10px 24px rgba(15,23,42,0.16)' }}>
                Ver oferta
              </button>
            </div>
            <div style={{ position: 'absolute', right: 12, bottom: 12, width: 110, height: 110, borderRadius: 28, overflow: 'hidden', background: 'rgba(255,255,255,0.18)', display: 'grid', placeItems: 'center' }}>
              {produtoPromocao.foto
                ? <img src={produtoPromocao.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <Percent size={44} color="rgba(var(--pg-on-brand-rgb), 0.92)" />}
            </div>
          </section>
        )}

        <section className="prg-stagger" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          <QuickAction title="Restaurantes" subtitle="Perto de você" count={restaurantesLabel} color="#f97316" icon={<Utensils size={22} />} onClick={() => navigate('/pedir?tipo=restaurante')} />
          <QuickAction title="Ambulantes" subtitle="Perto da praia" count={ambulantesLabel} color="#16a34a" icon={<ShoppingBag size={22} />} onClick={() => navigate('/pedir?tipo=ambulante')} />
          <QuickAction title="Radar ao vivo" subtitle="Ache quem está na praia" count={ambulantesLabel} color="#0284c7" icon={<MapPin size={22} />} onClick={() => navigate('/ambulantes')} />
          <QuickAction title="Cupons" subtitle="Descontos exclusivos" count={cupons.length > 0 ? `${cupons.length} ativo${cupons.length === 1 ? '' : 's'}` : undefined} color="#7c3aed" icon={<Ticket size={22} />} onClick={() => setCuponsAberto(true)} />
        </section>

        {/* Evento em destaque — só aparece se existir um marcado no banco.
            Nada de cartão de exemplo: praia sem evento cadastrado não mostra
            faixa nenhuma. */}
        {!eventoDestaque && <div style={{ marginBottom: 22 }}><BannerEventos onClick={() => navigate('/eventos')}/></div>}
        {eventoDestaque && (
          <button
            type="button"
            onClick={() => navigate('/eventos')}
            aria-label={`Evento em destaque: ${eventoDestaque.titulo}`}
            style={{
              position: 'relative',
              overflow: 'hidden',
              width: '100%',
              minHeight: 126,
              marginBottom: 24,
              padding: 0,
              border: 'none',
              borderRadius: 22,
              cursor: 'pointer',
              textAlign: 'left',
              background: 'linear-gradient(120deg, #1e1b4b 0%, #312e81 45%, #7c3aed 100%)',
              boxShadow: '0 16px 34px -16px rgba(49,46,129,0.9)',
            }}
          >
            {eventoDestaque.imagem_url && (
              <img
                src={eventoDestaque.imagem_url}
                alt=""
                aria-hidden
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }}
              />
            )}
            <span
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(100deg, rgba(15,10,45,0.92) 12%, rgba(15,10,45,0.55) 62%, rgba(15,10,45,0.25) 100%)',
              }}
            />
            <span style={{ position: 'relative', display: 'block', padding: '15px 16px 16px' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '3px 9px',
                  borderRadius: 999,
                  fontSize: 9.5,
                  fontWeight: 900,
                  letterSpacing: 0,
                  color: 'var(--pg-on-brand)',
                  background: '#16a34a',
                }}
              >
                EM DESTAQUE
              </span>
              <span style={{ display: 'block', marginTop: 9, fontSize: 19, fontWeight: 950, letterSpacing: 0, color: 'var(--pg-on-brand)', lineHeight: 1.15 }}>
                {eventoDestaque.titulo}
              </span>
              {eventoDestaque.categoria && (
                <span style={{ display: 'block', marginTop: 4, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.82)' }}>
                  {eventoDestaque.categoria}
                </span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, fontWeight: 800, color: 'rgba(var(--pg-on-brand-rgb), 0.92)' }}>
                <CalendarDays size={13} strokeWidth={2.6} />
                {[fmtDataCurta(eventoDestaque.data), eventoDestaque.hora?.slice(0, 5), eventoDestaque.local_nome]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
          </button>
        )}

        <section style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: 19, fontWeight: 950, color: 'var(--pg-ink)', margin: 0 }}>Categorias</h3>
              {catSel && (
                <span style={{ display: 'block', marginTop: 3, color: 'var(--pg-muted)', fontSize: 10, fontWeight: 800 }}>
                  Filtro: {CATEGORIAS.find(categoria => categoria.id === catSel)?.nome}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {catSel && (
                <button type="button" onClick={() => setCatSel(null)} style={{ border: 0, background: 'transparent', color: 'var(--pg-muted)', padding: '8px 6px', fontSize: 11, fontWeight: 900, cursor: 'pointer' }}>
                  Limpar
                </button>
              )}
              <button type="button" onClick={() => setCategoriasOpen(true)} style={{ minHeight: 36, border: '1px solid var(--pg-line)', borderRadius: 11, background: 'var(--pg-brand-soft)', color: 'var(--pg-ocean-dark)', padding: '0 11px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 950, cursor: 'pointer' }}>
                <Grid2X2 size={15} aria-hidden="true" /> Todos
              </button>
            </div>
          </div>
          <div className="prg-category-strip" style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '2px 1px 8px', scrollbarWidth: 'none', scrollSnapType: 'x proximity' }}>
            {CATEGORIAS.filter(cat => CATEGORIAS_DESTAQUE.includes(cat.id)).map(cat => {
              const sel = catSel === cat.id
              const restrita = 'ageRestricted' in cat && cat.ageRestricted
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
                  background: sel ? `${cat.cor}12` : 'var(--pg-surface)',
                  position: 'relative',
                  overflow: 'hidden',
                  padding: '11px 9px 10px 12px',
                  cursor: 'pointer',
                  boxShadow: sel ? `0 12px 25px ${cat.cor}38` : `0 8px 20px rgba(15,23,42,0.06), 0 3px 10px ${cat.cor}12`,
                  textAlign: 'left',
                  scrollSnapAlign: 'start',
                  }}>
                  <span style={{ position: 'relative', zIndex: 1, display: 'block', maxWidth: restrita ? '48%' : '62%', fontSize: restrita ? 11.2 : 12, fontWeight: 950, color: 'var(--pg-ink)', lineHeight: 1.15 }}>{cat.nome}</span>
                  <span style={{ position: 'absolute', zIndex: 1, left: 12, bottom: restrita ? 4 : 10, display: 'block', fontSize: 10, fontWeight: 850, color: sel ? 'var(--pg-ink)' : 'var(--pg-muted)', whiteSpace: 'nowrap' }}>
                    {count} {count === 1 ? 'loja' : 'lojas'}{restrita ? ' · 18+' : ''}
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
              <div style={{ borderRadius: 24, padding: 16, background: 'var(--pg-warning-bg)', border: '1px dashed var(--pg-warning)', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: 17, background: 'var(--pg-warning-bg)', color: 'var(--pg-warning)', display: 'grid', placeItems: 'center' }}>
                  <Ticket size={24} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 950, color: 'var(--pg-warning)' }}>Cupons PraiaGo</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--pg-warning)', marginTop: 3 }}>
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
                  style={{ borderRadius: 24, padding: 16, background: 'var(--pg-warning-bg)', border: '1px dashed var(--pg-warning)', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', cursor: 'pointer' }}
                >
                  <div style={{ width: 50, height: 50, borderRadius: 18, background: 'var(--pg-warning-bg)', color: 'var(--pg-warning)', display: 'grid', placeItems: 'center' }}>
                    <Ticket size={24} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 950, color: 'var(--pg-warning)' }}>{c.titulo}</span>
                      <span style={{ fontSize: 11, fontWeight: 950, color: 'var(--pg-on-brand)', background: '#ea580c', padding: '4px 8px', borderRadius: 999 }}>{desconto}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--pg-warning)', marginTop: 5 }}>
                      Use {c.codigo}{c.valor_minimo > 0 ? ` · minimo R$ ${Number(c.valor_minimo).toFixed(2).replace('.', ',')}` : ''}
                    </div>
                    {c.validade && <div style={{ fontSize: 10, color: 'var(--pg-warning)', fontWeight: 700, marginTop: 3 }}>Valido ate {new Date(c.validade).toLocaleDateString('pt-BR')}</div>}
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section style={{ marginBottom: 26 }}>
          <div ref={resultsRef} style={{ scrollMarginTop: 16 }}><SectionHeader title={soFavoritos ? 'Seus favoritos' : catSel || busca ? 'Resultado da busca' : 'Perto de você'} action={soFavoritos ? 'Ver todos' : 'Explorar'} onAction={() => soFavoritos ? setSoFavoritos() : navigate('/pedir')} /></div>
          {loading ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {[0, 1].map(i => <div key={i} className="shimmer" style={{ height: 124, borderRadius: 24 }} />)}
            </div>
          ) : catalogError && vendedores.length === 0 ? <p className="pg-caption">O catálogo estará disponível quando a conexão for restabelecida.</p> : vendedores.length === 0 ? (
            <div style={{ borderRadius: 24, border: '1px solid var(--pg-line)', background: 'var(--pg-surface-alt)', padding: 24, textAlign: 'center', color: 'var(--pg-muted)' }}>
              <Search size={30} color="var(--pg-faint)" style={{ margin: '0 auto 10px' }} />
              {/* Com filtro ativo o catalogo pode ate estar cheio: dizer "nenhum vendedor
                  ainda" faz o cliente achar que o app esta vazio em vez de limpar a busca. */}
              <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--pg-ink)' }}>
                {regiaoSemVendedor
                  ? `Ainda não atendemos ${cidadeAtendida}`
                  : catalogo.length === 0
                    ? 'Nenhum vendedor disponível ainda'
                    : soFavoritos ? 'Você ainda não favoritou ninguém' : 'Nada encontrado'}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 5 }}>
                {regiaoSemVendedor
                  ? 'Estamos começando pela Baixada Santista. Praia Grande já tem vendedores ativos agora.'
                  : catalogo.length === 0
                  ? 'Quando um restaurante ou ambulante publicar cardápio, ele aparece aqui.'
                  : soFavoritos ? 'Toque no coração de uma loja pra ela ficar salva aqui.'
                  : 'Tente outro termo ou limpe os filtros.'}
              </div>
              {regiaoSemVendedor && (
                <button
                  type="button"
                  onClick={() => definirPosicaoManual(CENTROS_CIDADES['Praia Grande'][0], CENTROS_CIDADES['Praia Grande'][1])}
                  style={{ marginTop: 12, border: 0, borderRadius: 999, padding: '10px 20px', fontSize: 13, fontWeight: 900, color: 'var(--pg-action-ink)', background: 'var(--pg-action)', cursor: 'pointer' }}
                >
                  Ver Praia Grande
                </button>
              )}
              {catalogo.length > 0 && !soFavoritos && (busca || catSel) && (
                <button
                  onClick={() => { setBusca(''); setCatSel(null) }}
                  style={{ marginTop: 12, border: 'none', borderRadius: 999, padding: '9px 18px', fontSize: 13, fontWeight: 900, color: 'var(--pg-action-ink)', background: 'var(--pg-action)', cursor: 'pointer' }}
                >
                  Limpar filtros
                </button>
              )}
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
      <SeletorRegiao
        aberto={regiaoAberta}
        vendedores={catalogo}
        cidadeAtual={cidadeAtendida as CidadeAtendida | null}
        onEscolher={(_cidade, centro) => definirPosicaoManual(centro[0], centro[1])}
        onFechar={() => setRegiaoAberta(false)}
      />
      <CuponsPanel
        aberto={cuponsAberto}
        cupons={cupons}
        onFechar={() => setCuponsAberto(false)}
      />
    </div>
  )
}
