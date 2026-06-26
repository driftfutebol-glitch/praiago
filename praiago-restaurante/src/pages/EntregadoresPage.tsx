import { useState, useRef } from 'react'
import { UserPlus, Phone, Bike, Car, Footprints, X, CheckCircle, Clock, MapPin } from 'lucide-react'

type Veiculo = 'moto' | 'bicicleta' | 'carro' | 'a_pe'
type StatusEntregador = 'disponivel' | 'em_entrega' | 'offline'

type Entregador = {
  id: string
  nome: string
  telefone: string
  veiculo: Veiculo
  status: StatusEntregador
  pedidosHoje: number
  foto: string | null
}

const STORAGE_KEY = 'praiago_restaurante_entregadores'

function loadEntregadores(): Entregador[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : mockInicial
  } catch { return mockInicial }
}

const mockInicial: Entregador[] = [
  { id: '1', nome: 'Carlos Mendes', telefone: '(13) 98801-1234', veiculo: 'moto', status: 'em_entrega', pedidosHoje: 5, foto: null },
  { id: '2', nome: 'Lucas Santos',  telefone: '(13) 99102-5678', veiculo: 'bicicleta', status: 'disponivel', pedidosHoje: 3, foto: null },
]

const veiculoConfig: Record<Veiculo, { icon: typeof Bike; label: string; emoji: string }> = {
  moto:      { icon: Bike,       label: 'Moto',      emoji: '🏍️' },
  bicicleta: { icon: Bike,       label: 'Bicicleta', emoji: '🚴' },
  carro:     { icon: Car,        label: 'Carro',     emoji: '🚗' },
  a_pe:      { icon: Footprints, label: 'A pé',      emoji: '🚶' },
}

const statusConfig: Record<StatusEntregador, { label: string; bg: string; color: string }> = {
  disponivel: { label: 'Disponível',  bg: '#dcfce7', color: '#16a34a' },
  em_entrega: { label: 'Em entrega',  bg: '#dbeafe', color: '#2563eb' },
  offline:    { label: 'Offline',     bg: '#f1f5f9', color: '#94a3b8' },
}

function FormModal({ onClose, onSave }: { onClose: () => void; onSave: (e: Omit<Entregador, 'id' | 'pedidosHoje' | 'foto'>) => void }) {
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [veiculo, setVeiculo] = useState<Veiculo>('moto')

  function submit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!nome.trim() || !telefone.trim()) return
    onSave({ nome: nome.trim(), telefone: telefone.trim(), veiculo, status: 'offline' })
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 440, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>Cadastrar entregador</h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>Sua equipe de entrega própria</p>
          </div>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 10, padding: 8, cursor: 'pointer' }}>
            <X size={18} color="#64748b" />
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>Nome completo *</label>
            <input
              value={nome} onChange={e => setNome(e.target.value)}
              placeholder="Ex: João Silva"
              required
              style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #e2e8f0', borderRadius: 12, fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>Telefone *</label>
            <input
              value={telefone} onChange={e => setTelefone(e.target.value)}
              placeholder="(13) 9 0000-0000"
              required
              style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #e2e8f0', borderRadius: 12, fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 8 }}>Veículo</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(Object.keys(veiculoConfig) as Veiculo[]).map(v => (
                <button
                  key={v} type="button" onClick={() => setVeiculo(v)}
                  style={{
                    padding: '12px 10px', borderRadius: 12, cursor: 'pointer', border: 'none',
                    background: veiculo === v ? '#fff7ed' : '#f8fafc',
                    outline: veiculo === v ? '2px solid #f97316' : '1.5px solid #e2e8f0',
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 13, fontWeight: veiculo === v ? 700 : 500,
                    color: veiculo === v ? '#f97316' : '#475569',
                  }}>
                  <span style={{ fontSize: 18 }}>{veiculoConfig[v].emoji}</span>
                  {veiculoConfig[v].label}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" style={{
            marginTop: 4, padding: '14px 0',
            background: 'linear-gradient(135deg, #f97316, #ea580c)',
            border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 800,
            color: '#fff', cursor: 'pointer', boxShadow: '0 6px 20px rgba(249,115,22,0.35)',
          }}>
            Cadastrar entregador
          </button>
        </form>
      </div>
    </div>
  )
}

export default function EntregadoresPage() {
  const [entregadores, setEntregadores] = useState<Entregador[]>(loadEntregadores)
  const [showForm, setShowForm] = useState(false)
  const nextId = useRef(Date.now())

  function save(list: Entregador[]) {
    setEntregadores(list)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  }

  function addEntregador(data: Omit<Entregador, 'id' | 'pedidosHoje' | 'foto'>) {
    const novo: Entregador = { ...data, id: String(nextId.current++), pedidosHoje: 0, foto: null }
    save([...entregadores, novo])
  }

  function removeEntregador(id: string) {
    save(entregadores.filter(e => e.id !== id))
  }

  function cycleStatus(id: string) {
    const cycle: Record<StatusEntregador, StatusEntregador> = {
      disponivel: 'offline', em_entrega: 'disponivel', offline: 'disponivel',
    }
    save(entregadores.map(e => e.id === id ? { ...e, status: cycle[e.status] } : e))
  }

  const disponiveis = entregadores.filter(e => e.status === 'disponivel').length
  const emEntrega   = entregadores.filter(e => e.status === 'em_entrega').length

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: 32 }}>
      {showForm && <FormModal onClose={() => setShowForm(false)} onSave={addEntregador} />}

      {/* Header */}
      <div style={{ background: '#fff', padding: '24px 32px 20px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', margin: 0 }}>Minha equipe</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Entregadores próprios do restaurante</p>
          </div>
          <button onClick={() => setShowForm(true)} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'linear-gradient(135deg, #f97316, #ea580c)',
            border: 'none', borderRadius: 12, padding: '11px 20px',
            color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(249,115,22,0.3)',
          }}>
            <UserPlus size={16} /> Adicionar
          </button>
        </div>

        {/* Stats rápidas */}
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { n: entregadores.length, l: 'Total',       bg: '#f1f5f9', c: '#0f172a' },
            { n: disponiveis,         l: 'Disponíveis', bg: '#dcfce7', c: '#16a34a' },
            { n: emEntrega,           l: 'Em entrega',  bg: '#dbeafe', c: '#2563eb' },
          ].map(s => (
            <div key={s.l} style={{ background: s.bg, borderRadius: 12, padding: '10px 16px', textAlign: 'center', minWidth: 90 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.c }}>{s.n}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div style={{ padding: '20px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {entregadores.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🚴</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Nenhum entregador cadastrado</div>
            <div style={{ fontSize: 13 }}>Cadastre sua equipe de entrega própria</div>
          </div>
        )}

        {entregadores.map(e => {
          const st = statusConfig[e.status]
          const vc = veiculoConfig[e.veiculo]
          return (
            <div key={e.id} style={{
              background: '#fff', borderRadius: 18, padding: '18px 20px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
              border: e.status === 'em_entrega' ? '1.5px solid #bfdbfe' : '1.5px solid #f1f5f9',
              display: 'flex', alignItems: 'center', gap: 16,
            }}>
              {/* Avatar */}
              <div style={{
                width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, fontWeight: 700,
                boxShadow: '0 4px 12px rgba(249,115,22,0.25)',
              }}>
                {e.foto ? (
                  <img src={e.foto} alt={e.nome} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 20 }}>{vc.emoji}</span>
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{e.nome}</span>
                  <span style={{
                    background: st.bg, color: st.color, borderRadius: 20,
                    padding: '2px 10px', fontSize: 11, fontWeight: 700,
                  }}>{st.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>
                    <Phone size={12} /> {e.telefone}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>
                    {vc.emoji} {vc.label}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>
                    <CheckCircle size={12} color="#22c55e" /> {e.pedidosHoje} entregas hoje
                  </span>
                </div>
              </div>

              {/* Ações */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => cycleStatus(e.id)} style={{
                  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
                  padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#475569',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                  {e.status === 'offline' ? 'Ativar' : 'Status'}
                </button>
                <button onClick={() => removeEntregador(e.id)} style={{
                  background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
                  padding: '8px 12px', cursor: 'pointer',
                }}>
                  <X size={14} color="#ef4444" />
                </button>
              </div>
            </div>
          )
        })}

        {/* Info de integração */}
        {entregadores.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #fff7ed, #fef3c7)',
            border: '1px solid #fed7aa', borderRadius: 16, padding: '16px 20px',
            marginTop: 8,
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <MapPin size={18} color="#f97316" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#c2410c', marginBottom: 4 }}>
                  Rastreamento em Ao Vivo
                </div>
                <div style={{ fontSize: 12, color: '#9a3412', lineHeight: 1.5 }}>
                  Veja seus entregadores no mapa em tempo real na aba <b>Ao Vivo</b>.
                  Quando um entregador usar o app deles, a posição aparece automaticamente.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
