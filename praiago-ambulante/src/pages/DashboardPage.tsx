import { useState, useEffect } from 'react'
import { Package, Bell, MapPin, TrendingUp, DollarSign,
         ShoppingBag, Settings, ChevronRight, Zap, Navigation } from 'lucide-react'
import { useGPS } from '../hooks/useGPS'

// ── Dados de zonas inline (sem dependência externa) ──────────
const ZONAS = [
  { id: 'praia_boqueirao',   nome: 'Boqueirão',   emoji: '🥥', cor: '#22c55e', nivel: 'explosivo', pedidos: 47, ambulantes: 3 },
  { id: 'praia_canto_forte', nome: 'Canto Forte',  emoji: '🏖️', cor: '#ef4444', nivel: 'quente',    pedidos: 31, ambulantes: 2 },
  { id: 'praia_ocian',       nome: 'Ocian',        emoji: '🌴', cor: '#f59e0b', nivel: 'morno',     pedidos: 14, ambulantes: 1 },
  { id: 'praia_tupi',        nome: 'Tupi',         emoji: '🌊', cor: '#475569', nivel: 'frio',      pedidos: 3,  ambulantes: 0 },
]

const NIVEL_COR: Record<string, { bg: string; cor: string; emoji: string; label: string }> = {
  explosivo: { bg: 'rgba(168,85,247,0.15)', cor: '#a855f7', emoji: '⚡', label: 'Explosivo!' },
  quente:    { bg: 'rgba(239,68,68,0.12)',  cor: '#ef4444', emoji: '🔥', label: 'Agitado'    },
  morno:     { bg: 'rgba(245,158,11,0.12)', cor: '#f59e0b', emoji: '🌤️', label: 'Moderado'   },
  frio:      { bg: 'rgba(71,85,105,0.10)',  cor: '#64748b', emoji: '🧊', label: 'Calmo'      },
}

// ── Barra de precisão GPS ────────────────────────────────────
function AccuracyBar({ accuracy }: { accuracy: number }) {
  const isExc  = accuracy < 25
  const isGood = accuracy < 80
  const cor    = isExc ? '#22c55e' : isGood ? '#fbbf24' : '#ef4444'
  const label  = isExc ? 'Excelente' : isGood ? 'Boa' : 'Baixa'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.8 }}>PRECISÃO GPS</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: cor }}>{label} · ±{Math.round(accuracy)}m</span>
      </div>
      <div style={{ height: 4, background: '#1e293b', borderRadius: 10, overflow: 'hidden', display: 'flex', gap: 2 }}>
        <div style={{ flex: 1, background: accuracy < 120 ? cor : '#334155', borderRadius: 10 }} />
        <div style={{ flex: 1, background: accuracy <  80 ? cor : '#334155', borderRadius: 10 }} />
        <div style={{ flex: 1, background: accuracy <  25 ? cor : '#334155', borderRadius: 10 }} />
      </div>
    </div>
  )
}

// ── Page principal ───────────────────────────────────────────
export default function DashboardPage() {
  const { data, status } = useGPS()
  const [online,  setOnline]  = useState(true)
  const [pulse,   setPulse]   = useState(false)
  const [zonaIdx, setZonaIdx] = useState(0)   // simula zona atual
  const zonaAtual = ZONAS[zonaIdx]
  const nivelCfg  = NIVEL_COR[zonaAtual.nivel]

  const isActive = status === 'active'
  const isError  = status === 'error'

  // Pulso visual a cada atualização GPS
  useEffect(() => {
    if (!data) return
    setPulse(true)
    const t = setTimeout(() => setPulse(false), 600)
    return () => clearTimeout(t)
  }, [data?.ts])

  // Simula troca de zona a cada 30s
  useEffect(() => {
    const t = setInterval(() => setZonaIdx(i => (i + 1) % ZONAS.length), 30000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: 100 }}>

      {/* ── Header gradient ──────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg,#0ea5e9 0%,#22c55e 100%)',
        padding: '32px 20px 68px', color: '#fff', position: 'relative', overflow: 'hidden',
      }}>
        <svg viewBox="0 0 1440 120" preserveAspectRatio="none"
          style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 60, display: 'block', opacity: 0.12 }}>
          <path fill="#fff" d="M0,40L60,53C120,67,240,93,360,93C480,93,600,67,720,53C840,40,960,40,1080,53C1200,67,1320,80,1380,87L1440,93L1440,120L0,120Z" />
        </svg>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 50, height: 50, borderRadius: 18, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
              🏝️
            </div>
            <div>
              <p style={{ fontSize: 13, opacity: 0.85, fontWeight: 500, margin: 0 }}>Bom trabalho,</p>
              <h1 style={{ fontSize: 21, fontWeight: 900, letterSpacing: -0.5, margin: 0 }}>Ambulante Show</h1>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 14, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Bell size={20} color="#fff" />
            </button>
            <button style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 14, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Settings size={20} color="#fff" />
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 20px', marginTop: -42, position: 'relative', zIndex: 2 }}>

        {/* ── Card GPS Status ───────────────────────────────── */}
        <div style={{
          background: '#0f172a', borderRadius: 26, padding: '22px',
          marginBottom: 18, boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 18,
                background: isActive ? 'rgba(34,197,94,0.15)' : isError ? 'rgba(239,68,68,0.15)' : 'rgba(100,116,139,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: isActive ? '0 0 24px rgba(34,197,94,0.25)' : 'none',
              }}>
                <MapPin size={26} color={isActive ? '#22c55e' : isError ? '#ef4444' : '#64748b'} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc' }}>
                  {isActive ? 'GPS Ativo — Visível' : isError ? 'GPS Offline' : 'Iniciando GPS...'}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  {isActive
                    ? `${data?.lat.toFixed(5)}, ${data?.lng.toFixed(5)}`
                    : isError ? 'Verifique as permissões' : 'Aguardando sinal estável'}
                </div>
              </div>
            </div>

            {/* Indicador pulsante */}
            <div style={{ position: 'relative', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isActive && (
                <div style={{
                  position: 'absolute', inset: -6, borderRadius: '50%',
                  background: 'rgba(34,197,94,0.2)',
                  transform: pulse ? 'scale(2)' : 'scale(1)',
                  opacity: pulse ? 0 : 1,
                  transition: 'all 0.6s ease-out',
                }} />
              )}
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: isActive ? '#22c55e' : isError ? '#ef4444' : '#475569',
                boxShadow: isActive ? '0 0 12px rgba(34,197,94,0.6)' : 'none',
              }} />
            </div>
          </div>

          {isActive && data && <AccuracyBar accuracy={data.accuracy} />}

          {isError && (
            <button style={{
              width: '100%', marginTop: 12, padding: '12px',
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 14, color: '#ef4444', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
              onClick={() => window.location.reload()}
            >
              <Navigation size={14} /> Tentar novamente
            </button>
          )}
        </div>

        {/* ── Zona Atual (IA) ───────────────────────────────── */}
        <div style={{
          background: nivelCfg.bg, border: `1.5px solid ${nivelCfg.cor}40`,
          borderRadius: 24, padding: '18px 20px', marginBottom: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={16} color={nivelCfg.cor} />
              <span style={{ fontSize: 11, fontWeight: 800, color: nivelCfg.cor, textTransform: 'uppercase', letterSpacing: 1 }}>
                Sua Zona Atual
              </span>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 10,
              background: nivelCfg.cor, color: '#fff',
            }}>
              {nivelCfg.emoji} {nivelCfg.label}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 32 }}>{zonaAtual.emoji}</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{zonaAtual.nome}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {zonaAtual.pedidos} pedidos/h · {zonaAtual.ambulantes} ambulantes aqui
              </div>
            </div>
          </div>

          {/* Barra de demanda */}
          <div style={{ height: 6, background: 'rgba(255,255,255,0.4)', borderRadius: 10 }}>
            <div style={{
              height: '100%',
              width: `${(zonaAtual.pedidos / 50) * 100}%`,
              background: nivelCfg.cor, borderRadius: 10,
              transition: 'width 1s',
            }} />
          </div>

          {/* Sugestão IA */}
          {zonaAtual.nivel === 'frio' && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#f97316', fontWeight: 700 }}>
              💡 Boqueirão está EXPLOSIVA com {ZONAS[0].ambulantes} ambulantes — mova-se para lá!
            </div>
          )}
          {zonaAtual.nivel === 'explosivo' && (
            <div style={{ marginTop: 12, fontSize: 12, color: nivelCfg.cor, fontWeight: 700 }}>
              🎯 Você está na melhor zona agora! Aproveite o movimento.
            </div>
          )}
        </div>

        {/* ── Toggle Aberto/Fechado ─────────────────────────── */}
        <div style={{
          background: '#fff', borderRadius: 24, padding: '18px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 4px 16px rgba(0,0,0,0.05)', marginBottom: 18,
          border: '1.5px solid #f1f5f9',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 16,
              background: online ? '#f0fdf4' : '#f1f5f9',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShoppingBag size={22} color={online ? '#16a34a' : '#94a3b8'} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                Ponto {online ? 'Aberto' : 'Fechado'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {online ? 'Recebendo novos pedidos' : 'Indisponível para pedidos'}
              </div>
            </div>
          </div>
          <button onClick={() => setOnline(!online)} style={{
            width: 56, height: 30, borderRadius: 15,
            background: online ? '#16a34a' : '#e2e8f0',
            border: 'none', position: 'relative', cursor: 'pointer', transition: 'background 0.3s',
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', background: '#fff',
              position: 'absolute', top: 4, left: online ? 30 : 4,
              transition: 'left 0.3s cubic-bezier(0.175,0.885,0.32,1.275)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>

        {/* ── Stats ─────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
          {[
            { icon: Package,    cor: '#2563eb', bg: '#eff6ff', valor: '14', label: 'Pedidos hoje',  change: '+12%' },
            { icon: DollarSign, cor: '#16a34a', bg: '#f0fdf4', valor: 'R$ 482', label: 'Ganhos hoje', change: '+5%' },
          ].map(({ icon: Icon, cor, bg, valor, label, change }) => (
            <div key={label} style={{ background: '#fff', borderRadius: 22, padding: '18px', border: '1.5px solid #f1f5f9', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 13, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={20} color={cor} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, color: '#16a34a', fontSize: 11, fontWeight: 800 }}>
                  <TrendingUp size={11} /> {change}
                </div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a' }}>{valor}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── Atalho Cardápio ───────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)',
          borderRadius: 24, padding: '18px 20px',
          display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
        }}>
          <div style={{ width: 46, height: 46, borderRadius: 15, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
            🛒
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Gerenciar Cardápio</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>12 itens ativos agora</div>
          </div>
          <ChevronRight size={18} color="#475569" />
        </div>

      </div>

      {/* ── Badge GPS visível flutuante ───────────────────────── */}
      {online && isActive && (
        <div style={{
          position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
          background: '#0ea5e9',   /* ← bug corrigido: era '#10ea5e9' */
          color: '#fff', padding: '11px 22px', borderRadius: 30,
          display: 'flex', alignItems: 'center', gap: 10,
          fontWeight: 800, fontSize: 13,
          boxShadow: '0 10px 28px rgba(14,165,233,0.45)',
          zIndex: 100, whiteSpace: 'nowrap',
          border: '2px solid rgba(255,255,255,0.25)',
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', animation: 'pulse-w 1.5s infinite' }} />
          VOCÊ ESTÁ VISÍVEL NA PRAIA
        </div>
      )}

      <style>{`
        @keyframes pulse-w {
          0%   { opacity: 1; transform: scale(1);   }
          50%  { opacity: 0.5; transform: scale(1.3); }
          100% { opacity: 1; transform: scale(1);   }
        }
      `}</style>
    </div>
  )
}
