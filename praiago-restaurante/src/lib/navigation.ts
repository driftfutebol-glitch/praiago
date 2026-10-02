import { LayoutDashboard, ShoppingBag, UtensilsCrossed, TrendingUp, Users, Map, User, Wallet } from 'lucide-react'

// A mesma lista abastece o desktop e o menu completo do celular.
export const restaurantNavigation = [
  { to: '/', icon: LayoutDashboard, label: 'Painel' },
  { to: '/pedidos', icon: ShoppingBag, label: 'Pedidos' },
  { to: '/vendas', icon: TrendingUp, label: 'Vendas' },
  { to: '/cardapio', icon: UtensilsCrossed, label: 'Cardápio' },
  { to: '/entregadores', icon: Users, label: 'Entregadores' },
  { to: '/mapa', icon: Map, label: 'Zonas ao vivo' },
  { to: '/perfil', icon: User, label: 'Perfil da loja' },
  { to: '/carteira', icon: Wallet, label: 'Carteira' },
]

export const mobilePrimaryPaths = ['/', '/pedidos', '/cardapio', '/vendas']
