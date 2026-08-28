import { useEffect, useRef, useState } from 'react'
import {
  LayoutDashboard,
  ShoppingBag,
  TrendingUp,
  UtensilsCrossed,
  Users,
  Map,
  User,
  Bell,
  Star,
  Wifi,
  Zap,
  ArrowUpRight,
  Lock,
} from 'lucide-react'
import Marca from './Marca'

// Moldura de navegador com o Painel de Controle do restaurante desenhado dentro.
//
// Por que e desenhado em codigo e nao um print:
//   1. print de tela logada envelhece (data, nome da loja, numeros do dia) e
//      ainda vaza dado de quem estava logado na hora;
//   2. em codigo fica nitido em qualquer tamanho e acompanha o site.
//
// O layout segue a tela real do painel (praiago-restaurante): barra lateral com
// o bloco GESTAO (Painel, Pedidos, Vendas, Cardapio, Entregadores, Zonas Ao
// Vivo, Perfil) e o bloco RADAR DA PRAIA, topo com "Base do restaurante ativa"
// + "SINAL ESTAVEL", e os quatro cartoes de resumo. Se o painel mudar, mudar
// aqui tambem.

const LARANJA = '#f97316'
const ROXO = '#8b5cf6'

const GESTAO = [
  { icone: LayoutDashboard, texto: 'Painel', ativo: true },
  { icone: ShoppingBag, texto: 'Pedidos' },
  { icone: TrendingUp, texto: 'Vendas' },
  { icone: UtensilsCrossed, texto: 'Cardápio' },
  { icone: Users, texto: 'Entregadores' },
  { icone: Map, texto: 'Zonas Ao Vivo' },
  { icone: User, texto: 'Perfil' },
]

// Numeros ilustrativos: mostram o formato da tela, nao sao dados de loja real.
const CARTOES = [
  { icone: ShoppingBag, cor: LARANJA, valor: '23', rotulo: 'Pedidos hoje', pe: '4 em andamento' },
  { icone: TrendingUp, cor: '#22c55e', valor: 'R$ 1.284', rotulo: 'Faturamento', pe: 'meta: R$ 1.500' },
  { icone: Users, cor: '#3b82f6', valor: '18', rotulo: 'Clientes hoje', pe: '6 novos' },
  { icone: Star, cor: '#f59e0b', valor: '4.8 ★', rotulo: 'Avaliação', pe: '31 avaliações' },
]

export default function Navegador({ larguraMax = 620 }: { larguraMax?: number }) {
  // Tudo aqui dentro e dimensionado em px multiplicados por `e`, entao a
  // moldura precisa saber a largura REAL que sobrou pra ela. Medir com
  // ResizeObserver (em vez de receber um numero fixo) e o que faz a tela do
  // painel encolher junto no celular sem esticar nem cortar.
  const refCaixa = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(larguraMax)

  useEffect(() => {
    const caixa = refCaixa.current
    if (!caixa) return
    const obs = new ResizeObserver(([entrada]) => {
      const l = entrada.contentRect.width
      if (l > 0) setLargura(Math.min(l, larguraMax))
    })
    obs.observe(caixa)
    return () => obs.disconnect()
  }, [larguraMax])

  const e = largura / 620

  return (
    <div ref={refCaixa} style={{ width: '100%', maxWidth: larguraMax }}>
    <div
      style={{
        width: largura,
        borderRadius: 14 * e,
        overflow: 'hidden',
        background: '#ffffff',
        border: '1px solid rgba(2,32,71,0.10)',
        boxShadow:
          '0 2px 4px rgba(2,32,71,0.06), 0 14px 30px -10px rgba(2,32,71,0.22), 0 46px 84px -32px rgba(2,32,71,0.36)',
      }}
    >
      {/* ── Barra do navegador: e o que diz "isso e um site" num relance ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10 * e,
          padding: `${10 * e}px ${13 * e}px`,
          background: '#f1f5f9',
          borderBottom: '1px solid rgba(2,32,71,0.08)',
        }}
      >
        <span style={{ display: 'flex', gap: 5 * e, flexShrink: 0 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
            <span key={c} style={{ width: 9 * e, height: 9 * e, borderRadius: 999, background: c }} />
          ))}
        </span>
        <span
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6 * e,
            padding: `${5 * e}px ${11 * e}px`,
            borderRadius: 999,
            background: '#ffffff',
            border: '1px solid rgba(2,32,71,0.08)',
            fontSize: 10.5 * e,
            color: '#64748b',
            minWidth: 0,
          }}
        >
          <Lock size={10 * e} strokeWidth={2.8} style={{ color: '#22c55e', flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            praiago.com.br · central do restaurante
          </span>
        </span>
      </div>

      <div style={{ display: 'flex', background: '#fbfcfe' }}>
        {/* ── Barra lateral ── */}
        <aside
          style={{
            width: 116 * e,
            flexShrink: 0,
            padding: `${12 * e}px ${8 * e}px ${10 * e}px`,
            background: '#ffffff',
            borderRight: '1px solid rgba(2,32,71,0.07)',
          }}
        >
          <div style={{ padding: `0 ${4 * e}px` }}>
            <Marca largura={70 * e} />
            <div
              style={{
                fontSize: 7 * e,
                fontWeight: 900,
                letterSpacing: 1.4 * e,
                color: LARANJA,
                marginTop: 1 * e,
                paddingLeft: 1 * e,
              }}
            >
              RESTAURANTE
            </div>
          </div>

          {/* Chave aberto/fechado */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6 * e,
              margin: `${11 * e}px 0 ${12 * e}px`,
              padding: `${6 * e}px ${8 * e}px`,
              borderRadius: 8 * e,
              background: '#f0fdf4',
              border: '1px solid rgba(34,197,94,0.28)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 * e }}>
              <span style={{ width: 5 * e, height: 5 * e, borderRadius: 999, background: '#22c55e' }} />
              <span style={{ fontSize: 8.5 * e, fontWeight: 900, color: '#15803d', letterSpacing: 0.4 * e }}>
                ABERTO
              </span>
            </span>
            <span
              style={{
                width: 20 * e,
                height: 11 * e,
                borderRadius: 999,
                background: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                padding: 1.5 * e,
              }}
            >
              <span style={{ width: 8 * e, height: 8 * e, borderRadius: 999, background: '#ffffff' }} />
            </span>
          </div>

          <Rotulo texto="GESTÃO" e={e} />
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 1 * e }}>
            {GESTAO.map((m) => {
              const Icone = m.icone
              return (
                <span
                  key={m.texto}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7 * e,
                    padding: `${6 * e}px ${7 * e}px`,
                    borderRadius: 7 * e,
                    fontSize: 9.5 * e,
                    fontWeight: m.ativo ? 800 : 600,
                    color: m.ativo ? LARANJA : '#64748b',
                    background: m.ativo ? 'rgba(249,115,22,0.10)' : 'transparent',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Icone size={11 * e} strokeWidth={2.2} style={{ flexShrink: 0 }} />
                  {m.texto}
                </span>
              )
            })}
          </nav>

          <Rotulo texto="RADAR DA PRAIA" e={e} margemTopo={11 * e} />
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7 * e,
              padding: `${6 * e}px ${7 * e}px`,
              borderRadius: 7 * e,
              fontSize: 9.5 * e,
              fontWeight: 800,
              color: ROXO,
              background: 'rgba(139,92,246,0.10)',
              whiteSpace: 'nowrap',
            }}
          >
            <Zap size={11 * e} strokeWidth={2.4} style={{ flexShrink: 0 }} />
            RADAR ATIVO
          </span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7 * e,
              marginTop: 5 * e,
              padding: `${6 * e}px ${7 * e}px`,
              borderRadius: 7 * e,
              fontSize: 9.5 * e,
              fontWeight: 600,
              color: '#64748b',
              whiteSpace: 'nowrap',
            }}
          >
            <Bell size={11 * e} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            Notificações
            <span
              style={{
                marginLeft: 'auto',
                minWidth: 13 * e,
                height: 13 * e,
                borderRadius: 999,
                background: LARANJA,
                color: '#fff',
                fontSize: 8 * e,
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              3
            </span>
          </span>
        </aside>

        {/* ── Area principal ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Topo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10 * e,
              padding: `${8 * e}px ${14 * e}px`,
              background: '#ffffff',
              borderBottom: '1px solid rgba(2,32,71,0.06)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 * e, minWidth: 0 }}>
              <span style={{ width: 5 * e, height: 5 * e, borderRadius: 999, background: '#22c55e', flexShrink: 0 }} />
              <span
                style={{
                  fontSize: 9.5 * e,
                  color: '#475569',
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                Base do restaurante ativa
              </span>
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4 * e,
                padding: `${3.5 * e}px ${8 * e}px`,
                borderRadius: 999,
                background: '#f0fdf4',
                border: '1px solid rgba(34,197,94,0.3)',
                fontSize: 8 * e,
                fontWeight: 900,
                letterSpacing: 0.4 * e,
                color: '#15803d',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <Wifi size={9 * e} strokeWidth={2.6} />
              SINAL ESTÁVEL
            </span>
          </div>

          <div style={{ padding: `${13 * e}px ${14 * e}px ${16 * e}px` }}>
            <div style={{ fontSize: 10 * e, fontWeight: 800, color: LARANJA }}>Boa tarde, Quiosque Maré Alta 👋</div>
            <div
              style={{
                fontSize: 19 * e,
                fontWeight: 900,
                letterSpacing: -0.7 * e,
                color: '#0f172a',
                marginTop: 2 * e,
                lineHeight: 1.1,
              }}
            >
              Painel de Controle
            </div>
            <div style={{ fontSize: 8.5 * e, color: '#94a3b8', marginTop: 3 * e }}>
              Praia Grande, SP · atualizado em tempo real
            </div>

            {/* Cartoes de resumo */}
            <div style={{ display: 'flex', gap: 7 * e, marginTop: 12 * e }}>
              {CARTOES.map((c) => {
                const Icone = c.icone
                return (
                  <div
                    key={c.rotulo}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: `${9 * e}px ${9 * e}px ${10 * e}px`,
                      borderRadius: 10 * e,
                      background: '#ffffff',
                      border: '1px solid rgba(2,32,71,0.07)',
                      boxShadow: '0 4px 12px -8px rgba(2,32,71,0.3)',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 20 * e,
                        height: 20 * e,
                        borderRadius: 6 * e,
                        color: '#fff',
                        background: c.cor,
                      }}
                    >
                      <Icone size={11 * e} strokeWidth={2.4} />
                    </span>
                    <div
                      style={{
                        fontSize: 14 * e,
                        fontWeight: 900,
                        letterSpacing: -0.5 * e,
                        color: '#0f172a',
                        marginTop: 6 * e,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {c.valor}
                    </div>
                    <div
                      style={{
                        fontSize: 8.5 * e,
                        color: '#475569',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {c.rotulo}
                    </div>
                    <div
                      style={{
                        fontSize: 7.5 * e,
                        color: '#94a3b8',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {c.pe}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pedidos ativos + entregas */}
            <div style={{ display: 'flex', gap: 8 * e, marginTop: 9 * e }}>
              <div
                style={{
                  flex: 1.5,
                  minWidth: 0,
                  padding: `${10 * e}px ${11 * e}px`,
                  borderRadius: 10 * e,
                  background: '#ffffff',
                  border: '1px solid rgba(2,32,71,0.07)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 * e }}>
                  <span style={{ fontSize: 11 * e, fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap' }}>
                    Pedidos Ativos
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3 * e,
                      padding: `${4 * e}px ${9 * e}px`,
                      borderRadius: 999,
                      background: LARANJA,
                      color: '#fff',
                      fontSize: 8.5 * e,
                      fontWeight: 900,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Ver todos <ArrowUpRight size={9 * e} strokeWidth={3} />
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 * e, marginTop: 8 * e }}>
                  {[
                    { n: '#1042', i: '2× Açaí 500ml', v: 'R$ 48,00', s: 'Novo', c: LARANJA },
                    { n: '#1041', i: '1× Porção camarão', v: 'R$ 89,90', s: 'Preparo', c: '#0ea5e9' },
                  ].map((p) => (
                    <div
                      key={p.n}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7 * e,
                        padding: `${6 * e}px ${8 * e}px`,
                        borderRadius: 7 * e,
                        background: '#f8fafc',
                        minWidth: 0,
                      }}
                    >
                      <span style={{ width: 2.5 * e, alignSelf: 'stretch', borderRadius: 999, background: p.c, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 9 * e, fontWeight: 800, color: '#0f172a' }}>{p.n}</span>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 8 * e,
                            color: '#64748b',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {p.i}
                        </span>
                      </span>
                      <span style={{ fontSize: 9 * e, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>{p.v}</span>
                      <span
                        style={{
                          padding: `${2.5 * e}px ${6 * e}px`,
                          borderRadius: 999,
                          fontSize: 7.5 * e,
                          fontWeight: 900,
                          color: p.c,
                          background: `${p.c}1a`,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {p.s}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: `${10 * e}px ${11 * e}px`,
                  borderRadius: 10 * e,
                  background: '#fff7ed',
                  border: `1px solid ${LARANJA}44`,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 * e }}>
                  <span style={{ width: 5 * e, height: 5 * e, borderRadius: 999, background: '#22c55e' }} />
                  <span style={{ fontSize: 7.5 * e, fontWeight: 900, letterSpacing: 0.5 * e, color: '#15803d' }}>
                    AO VIVO
                  </span>
                </span>
                <div style={{ fontSize: 11.5 * e, fontWeight: 900, color: '#0f172a', marginTop: 5 * e, letterSpacing: -0.3 * e }}>
                  Entregas em Rota
                </div>
                <div style={{ fontSize: 8.5 * e, color: '#64748b', marginTop: 2 * e }}>2 entregadores ativos</div>
                <div
                  style={{
                    marginTop: 9 * e,
                    padding: `${6 * e}px`,
                    borderRadius: 7 * e,
                    background: LARANJA,
                    color: '#fff',
                    fontSize: 8 * e,
                    fontWeight: 900,
                    textAlign: 'center',
                    letterSpacing: 0.3 * e,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  ACESSAR RADAR TÁTICO
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}

function Rotulo({ texto, e, margemTopo = 0 }: { texto: string; e: number; margemTopo?: number }) {
  return (
    <div
      style={{
        fontSize: 7 * e,
        fontWeight: 900,
        letterSpacing: 1 * e,
        color: '#94a3b8',
        padding: `0 ${7 * e}px`,
        margin: `${margemTopo}px 0 ${5 * e}px`,
      }}
    >
      {texto}
    </div>
  )
}
