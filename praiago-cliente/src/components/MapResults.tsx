import { ChevronRight, MapPin, ShoppingBag, Store } from 'lucide-react'
import { formatMapDistance, type MapResult } from '../lib/mapDiscovery'

export default function MapResults({ items, loading, failed, onOpen, onExplore, onReset, filtered }: {
  items: MapResult[]; loading: boolean; failed: boolean; onOpen: (item: MapResult) => void
  onExplore: () => void; onReset: () => void; filtered: boolean
}) {
  return <section className="pg-discovery" aria-labelledby="map-results-title">
    <div className="pg-discovery-heading"><div><span className="pg-eyebrow">ESCOLHA SEU PRÓXIMO PEDIDO</span><h2 id="map-results-title">Por perto <span>{items.length}</span></h2></div><span className="pg-discovery-order">Mais próximos primeiro</span></div>
    {loading && items.length === 0 ? <p role="status" className="pg-discovery-status">Buscando lojas na região…</p> : items.length === 0 ? (
      <div className="pg-discovery-empty">
        <span className="pg-discovery-empty-icon"><ShoppingBag size={23}/></span>
        <div><h3>{failed ? 'Não foi possível atualizar as lojas' : filtered ? 'Nenhuma loja com estes filtros' : 'A praia está tranquila por aqui'}</h3><p>{failed ? 'Use o botão de tentar novamente acima.' : filtered ? 'Tente outro nome ou veja todas as opções.' : 'Quando houver uma loja disponível, ela aparece aqui.'}</p></div>
        <button className="pg-button pg-button-soft" onClick={filtered ? onReset : onExplore}>{filtered ? 'Limpar filtros' : 'Explorar catálogo'}<ChevronRight size={16}/></button>
      </div>
    ) : <>
      <p className="pg-discovery-caption">Lojas e distâncias a partir do seu ponto de referência, mesmo ao explorar outra praia.</p>
      <div className="pg-discovery-list">{items.map(item => <button key={`${item.tipo}-${item.id}`} className="pg-discovery-card" onClick={() => onOpen(item)} aria-label={`Ver cardápio de ${item.nome}`}>
        <span className={`pg-discovery-photo pg-discovery-photo-${item.tipo}`}>{item.foto ? <img src={item.foto} alt="" loading="lazy" decoding="async"/> : item.tipo === 'restaurante' ? <Store size={25}/> : <ShoppingBag size={25}/>}</span>
        <span className="pg-discovery-info"><strong>{item.nome}</strong><span>{item.tipo === 'restaurante' ? 'Restaurante' : 'Ambulante'}{item.categoria && ` · ${item.categoria}`}</span><span className="pg-discovery-meta"><span className={item.aberto ? 'pg-store-open' : 'pg-store-closed'}>{item.aberto ? 'Aberto agora' : 'Fechado'}</span><span><MapPin size={11}/>{formatMapDistance(item.distancia)}</span></span></span>
        <ChevronRight className="pg-discovery-arrow" size={17}/>
      </button>)}</div>
    </>}
  </section>
}
