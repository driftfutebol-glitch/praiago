import type { AmbulanteLive } from '../hooks/useNearbyAmbulantes'
import { semAcento, type Vendedor } from './catalogo'
import { distanciaKm } from './serviceArea'

export type MapSellerType = 'todos' | 'ambulante' | 'restaurante'
export type MapResult = {
  id: string; nome: string; categoria: string; aberto: boolean; foto?: string | null; distancia: number
} & ({ tipo: 'ambulante'; source: AmbulanteLive } | { tipo: 'restaurante'; source: Vendedor })

const validPoint = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180

/** Mesmos filtros para pinos e cartões. Recebe somente o catálogo regional autorizado. */
export function selectMapSellers(ambulantes: AmbulanteLive[], vendedores: Vendedor[], tipo: MapSellerType, soAbertos: boolean, busca: string) {
  const term = semAcento(busca)
  const matches = (...values: (string | null | undefined)[]) => semAcento(values.filter(Boolean).join(' ')).includes(term)
  return {
    ambulantes: tipo === 'restaurante' ? [] : ambulantes.filter(a => validPoint(a.lat, a.lng) && (!soAbertos || a.aberto) && matches(a.nome, a.categoria, a.zona)),
    restaurantes: tipo === 'ambulante' ? [] : vendedores.filter(v => v.tipo === 'restaurante' && v.localizacaoConfirmada && Array.isArray(v.pos) && validPoint(v.pos[0], v.pos[1]) && (!soAbertos || v.aberto) && matches(v.nome, v.categoria, v.endereco, v.zona)),
  }
}

export function mapResults(ambulantes: AmbulanteLive[], restaurantes: Vendedor[], pos: [number, number]): MapResult[] {
  const distance = (point: [number, number]) => Math.round(distanciaKm(pos[0], pos[1], point[0], point[1]) * 1000)
  const rows: MapResult[] = [
    ...ambulantes.map(a => ({ id: a.id, nome: a.nome, categoria: a.categoria, aberto: a.aberto, foto: a.fotoPerfil, distancia: distance([a.lat, a.lng]), tipo: 'ambulante' as const, source: a })),
    ...restaurantes.map(v => ({ id: v.id, nome: v.nome, categoria: v.categoria, aberto: v.aberto, foto: v.avatar, distancia: distance(v.pos), tipo: 'restaurante' as const, source: v })),
  ]
  return rows.sort((a, b) => a.distancia - b.distancia || a.nome.localeCompare(b.nome, 'pt-BR'))
}

export function formatMapDistance(metros: number) {
  return metros < 1000 ? `${Math.round(metros)} m` : `${(metros / 1000).toFixed(1).replace('.', ',')} km`
}
