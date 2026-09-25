import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { AmbulanteLive } from '../src/hooks/useNearbyAmbulantes'
import type { Vendedor } from '../src/lib/catalogo'
import { selectMapSellers, mapResults, formatMapDistance } from '../src/lib/mapDiscovery'
import { BEACH_SHAPES, beachAtPoint, beachNearCamera, initialBeach } from '../src/lib/beachMap'

const model = vi.hoisted(() => ({ ambulantes: [] as any[], vendedores: [] as any[], mounts: 0, error: null as string | null, clearManual: vi.fn(), setManual: vi.fn() }))
vi.mock('../src/hooks/useGPS', () => ({ CLIENTE_FALLBACK: [-24.005, -46.407], useGPS: () => ({ pos: [-24.005, -46.407], status: 'unavailable', fonte: 'ip', cidadeAproximada: 'Praia Grande', foraDaArea: false, modoRevisao: false, definirPosicaoManual: model.setManual, limparPosicaoManual: model.clearManual }) }))
vi.mock('../src/hooks/useNearbyAmbulantes', () => ({ useNearbyAmbulantes: () => ({ ambulantes: model.ambulantes, total: model.ambulantes.length }) }))
vi.mock('../src/hooks/useCatalogoRegiao', () => ({ useCatalogoRegiao: () => ({ vendedores: model.vendedores, loading: false }) }))
vi.mock('../src/store/useCatalogo', () => ({ useCatalogo: (selector: any) => selector({ error: model.error, refreshing: false }), carregarCatalogo: vi.fn() }))
vi.mock('react-leaflet', async () => {
  const { useState } = await import('react')
  const map = { stop: vi.fn(), getZoom: () => 15, getCenter: () => ({ lat: -24.015, lng: -46.415 }), getBounds: () => ({ intersects: () => true, contains: () => true }), setMinZoom: vi.fn(), setMaxZoom: vi.fn(), setMaxBounds: vi.fn(), whenReady: (fn: () => void) => fn(), fitBounds: vi.fn(), flyTo: vi.fn(), setView: vi.fn(), invalidateSize: vi.fn(), getContainer: () => document.createElement('div'), on: vi.fn(), off: vi.fn(), containerPointToLatLng: () => ({ distanceTo: () => 80 }) }
  return {
    MapContainer: ({ children, scrollWheelZoom }: any) => { const [instance] = useState(() => ++model.mounts); return <div data-testid="leaflet-map" data-instance={instance} data-scroll-zoom={String(scrollWheelZoom)}>{children}</div> },
    TileLayer: ({ updateWhenIdle, updateWhenZooming, keepBuffer }: any) => <div data-testid="tiles" data-idle={String(updateWhenIdle)} data-zooming={String(updateWhenZooming)} data-buffer={keepBuffer}/>,
    Marker: ({ children, title, interactive }: any) => <div data-testid={interactive === false ? 'map-decoration' : 'map-marker'} aria-label={title}>{children}</div>,
    Polygon: ({ pathOptions }: any) => <div data-testid="map-polygon" data-fill={pathOptions.fillColor}/>,
    Polyline: () => null, Pane: ({ children, name }: any) => <div data-testid={name === 'beach-artwork' ? 'beach-layer' : 'beach-decoration'}>{children}</div>,
    Popup: ({ children }: any) => <div>{children}</div>, Circle: () => null, useMap: () => map,
  }
})
import AmbulantesPage from '../src/pages/AmbulantesPage'
import BrandLogo from '../src/components/BrandLogo'
import { usePreferences } from '../src/store/usePreferences'

const amb = (change: Partial<AmbulanteLive> = {}): AmbulanteLive => ({ id: 'a1', nome: 'Açaí da Orla', categoria: 'Açaí', emoji: '🥥', lat: -24.0051, lng: -46.407, accuracy: 20, lastSeen: Date.now(), aberto: true, zona: 'Praia Grande', distancia: 10, fotoPerfil: null, fotoCapa: null, ...change })
const store = (change: Partial<Vendedor> = {}): Vendedor => ({ id: 'r1', nome: 'Cantina do Mar', categoria: 'Almoço', avaliacao: 0, avaliacoes: 0, tempo: '', distancia: '', emoji: '🍲', gradiente: '', aberto: false, localizacaoConfirmada: true, image: '', pos: [-24.007, -46.407], zona: 'Praia Grande', endereco: 'Avenida da praia', horarios: null, produtos: [], tipo: 'restaurante', ...change })
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output> }
function page() { return render(<MemoryRouter><AmbulantesPage/><Location/></MemoryRouter>) }
beforeEach(() => {
  model.ambulantes = [amb()]; model.vendedores = [store(), store({ id: 'a1', tipo: 'ambulante' })]; model.mounts = 0; model.error = null
  usePreferences.setState({ mapStyle: 'praia', reducedMotion: true })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})

describe('Marca e descoberta no mapa', () => {
  it('usa o arquivo original da marca, sem substituir pelo emoji', () => {
    const { container } = render(<BrandLogo/>);
    expect(screen.getByRole('img', { name: 'PraiaGo' })).toBeTruthy()
    expect(container.querySelector('image')?.getAttribute('href')).toBe('/praiago-logo-transparent.png')
    expect(container.textContent).not.toContain('🌴')
  })
  it('filtra tipo, abertura e busca sem acentos no mesmo conjunto de pinos e cartões', () => {
    expect(selectMapSellers([amb()], [store()], 'todos', false, 'acai').ambulantes).toHaveLength(1)
    expect(selectMapSellers([amb()], [store()], 'restaurante', false, '').ambulantes).toHaveLength(0)
    expect(selectMapSellers([amb()], [store()], 'todos', true, '').restaurantes).toHaveLength(0)
    expect(selectMapSellers([amb()], [store()], 'todos', false, 'avenida').restaurantes).toHaveLength(1)
  })
  it('não desenha lojas sem posição confirmada ou coordenadas válidas', () => {
    const result = selectMapSellers([amb({ lat: NaN }), amb({ lng: 190 })], [store({ localizacaoConfirmada: false }), store({ pos: [Infinity, 0] }), store({ pos: null as any })], 'todos', false, '')
    expect(result).toEqual({ ambulantes: [], restaurantes: [] })
  })
  it('ordena os dois tipos juntos pela distância real ao pino', () => {
    const rows = mapResults([amb({ lat: -24.1 })], [store()], [-24.005, -46.407])
    expect(rows.map(x => x.tipo)).toEqual(['restaurante', 'ambulante'])
    expect(formatMapDistance(125)).toBe('125 m'); expect(formatMapDistance(1200)).toBe('1,2 km')
  })
  it('começa compacto, amplia e reduz sem remontar o mapa', async () => {
    page(); const map = screen.getByTestId('leaflet-map'); const region = screen.getByRole('region', { name: 'Mapa da região' })
    expect(region.getAttribute('data-expanded')).toBe('false')
    await userEvent.click(screen.getByRole('button', { name: 'Ampliar mapa' }))
    expect(region.getAttribute('data-expanded')).toBe('true')
    await userEvent.click(screen.getByRole('button', { name: 'Reduzir mapa' }))
    expect(region.getAttribute('data-expanded')).toBe('false')
    expect(screen.getByTestId('leaflet-map')).toBe(map); expect(model.mounts).toBe(1)
  })
  it('alternar lista e mapa preserva a instância e limita o carregamento de tiles', async () => {
    page(); const map = screen.getByTestId('leaflet-map')
    await userEvent.click(screen.getByRole('button', { name: 'Lista', exact: true }))
    expect(document.getElementById('map-region')?.hidden).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Mapa', exact: true }))
    expect(screen.getByTestId('leaflet-map')).toBe(map); expect(model.mounts).toBe(1)
    expect(map.getAttribute('data-scroll-zoom')).toBe('false')
    expect(screen.queryByTestId('tiles')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Estilo Cidade' }))
    const tiles = screen.getByTestId('tiles')
    expect(tiles.getAttribute('data-idle')).toBe('true'); expect(tiles.getAttribute('data-zooming')).toBe('false'); expect(tiles.getAttribute('data-buffer')).toBe('1')
  })
  it('busca atualiza pinos e cartões e permite limpar o estado vazio', async () => {
    page(); fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar no mapa' }), { target: { value: 'acai' } })
    expect(screen.getByRole('button', { name: 'Ver cardápio de Açaí da Orla' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ver cardápio de Cantina do Mar' })).toBeNull()
    expect(screen.getAllByTestId('map-marker')).toHaveLength(2)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'inexistente' } })
    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(screen.getByRole('searchbox').getAttribute('value')).toBe('')
    expect(screen.getByRole('button', { name: 'Ver cardápio de Cantina do Mar' })).toBeTruthy()
  })
  it('abre o cardápio da loja correta sem iniciar pedido ou pagamento', async () => {
    page(); await userEvent.click(screen.getByRole('button', { name: 'Ver cardápio de Cantina do Mar' }))
    expect(screen.getByTestId('location').textContent).toBe('/pedir?v=r1')
  })
  it('catálogo vazio não injeta vendedores ou produtos de demonstração', () => {
    model.ambulantes = []; model.vendedores = []
    page()
    expect(screen.getByText('Quando houver uma loja disponível, ela aparece aqui.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Ver cardápio de/ })).toBeNull()
    expect(screen.getAllByTestId('map-marker')).toHaveLength(1)
  })
  it('alterna o estilo e informa quando a posição não é GPS', async () => {
    page(); expect(screen.getByRole('status', { name: 'Status da localização' }).textContent).toContain('Localização aproximada')
    await userEvent.click(screen.getByRole('button', { name: 'Estilo Cidade' }))
    expect(usePreferences.getState().mapStyle).toBe('ruas')
    expect(screen.queryByTestId('beach-layer')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Estilo Praia' }))
    expect(screen.queryByTestId('tiles')).toBeNull()
    expect(screen.getByTestId('beach-layer')).toBeTruthy()
    expect(model.mounts).toBe(1)
  })
  it('oferece praias reais sem modificar a localização ao trocar a zona explorada', async () => {
    page()
    const selector = screen.getByRole('combobox', { name: 'Praia em exibição' })
    expect(screen.getByRole('option', { name: 'Ocian' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Boqueirão' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Canto do Forte' })).toBeTruthy()
    await userEvent.selectOptions(selector, 'praia_ocian')
    expect((selector as HTMLSelectElement).value).toBe('praia_ocian')
    expect(screen.getAllByTestId('map-polygon').filter(node => node.getAttribute('data-fill') === 'var(--pg-map-sand-active)')).toHaveLength(1)
    expect(model.setManual).not.toHaveBeenCalled()
  })
  it('não confunde uma praia explorada com o GPS de quem está fora da orla', async () => {
    expect(beachAtPoint([-23.96, -46.33])).toBeNull()
    expect(initialBeach([-23.96, -46.33]).nome).toBe('Boqueirão')
    for (const shape of BEACH_SHAPES) {
      expect(beachAtPoint(shape.center)?.id).toBe(shape.zone.id)
      expect(beachNearCamera(shape.center).id).toBe(shape.zone.id)
    }
    page()
    await userEvent.click(screen.getByRole('button', { name: 'Ver meu ponto na cidade' }))
    expect(usePreferences.getState().mapStyle).toBe('ruas')
    expect(model.setManual).not.toHaveBeenCalled()
  })
})
