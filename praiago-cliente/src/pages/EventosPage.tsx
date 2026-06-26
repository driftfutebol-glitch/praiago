import { Calendar, MapPin, Clock, Ticket } from 'lucide-react'

type Evento = {
  id: number
  nome: string
  local: string
  data: string
  hora: string
  preco: number | null
  categoria: string
  emoji: string
  destaque?: boolean
}

const eventos: Evento[] = [
  {
    id: 1,
    nome: 'Forró na Praia',
    local: 'Orla de Praia Grande',
    data: 'Sáb, 28 Jun',
    hora: '19:00',
    preco: null,
    categoria: 'Música',
    emoji: '🎸',
    destaque: true,
  },
  {
    id: 2,
    nome: 'Sunset DJ Set',
    local: 'Bar do Zé · Praia',
    data: 'Sex, 27 Jun',
    hora: '17:30',
    preco: 25,
    categoria: 'Festa',
    emoji: '🌅',
    destaque: true,
  },
  {
    id: 3,
    nome: 'Torneio de Vôlei de Praia',
    local: 'Quadra da Orla',
    data: 'Dom, 29 Jun',
    hora: '08:00',
    preco: null,
    categoria: 'Esporte',
    emoji: '🏐',
  },
  {
    id: 4,
    nome: 'Noite do Samba',
    local: 'Quiosque Maresias',
    data: 'Sáb, 28 Jun',
    hora: '20:00',
    preco: 15,
    categoria: 'Música',
    emoji: '🥁',
  },
  {
    id: 5,
    nome: 'Feira de Artesanato',
    local: 'Calçadão da Praia',
    data: 'Dom, 29 Jun',
    hora: '09:00',
    preco: null,
    categoria: 'Cultura',
    emoji: '🎨',
  },
]

const filtros = ['Todos', 'Hoje', 'Música', 'Festa', 'Esporte', 'Cultura']

export default function EventosPage() {
  const destaques = eventos.filter(e => e.destaque)
  const outros = eventos.filter(e => !e.destaque)

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', paddingBottom: 24 }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 12px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9' }}>Eventos</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Praia Grande, SP · Esta semana</p>
      </div>

      {/* Filtros */}
      <div style={{ padding: '0 20px 16px', display: 'flex', gap: 8, overflowX: 'auto' }}>
        {filtros.map((f, i) => (
          <button key={f} style={{
            background: i === 0 ? 'linear-gradient(135deg, #0ea5e9, #22c55e)' : '#1e293b',
            border: 'none', borderRadius: 20, padding: '7px 16px',
            color: i === 0 ? '#fff' : '#94a3b8', fontSize: 12,
            fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>{f}</button>
        ))}
      </div>

      {/* Destaques */}
      <div style={{ padding: '0 20px 20px' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 14 }}>
          ★ Em destaque
        </h2>
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 4 }}>
          {destaques.map(ev => (
            <div key={ev.id} style={{
              background: 'linear-gradient(135deg, #1e293b, #0f172a)',
              border: '1px solid #334155', borderRadius: 20,
              padding: 20, minWidth: 220, flexShrink: 0, cursor: 'pointer',
            }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>{ev.emoji}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9', marginBottom: 6 }}>{ev.nome}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <MapPin size={12} color="#64748b" />
                <span style={{ fontSize: 12, color: '#64748b' }}>{ev.local}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                <Calendar size={12} color="#64748b" />
                <span style={{ fontSize: 12, color: '#64748b' }}>{ev.data} · {ev.hora}</span>
              </div>
              <button style={{
                width: '100%', background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
                border: 'none', borderRadius: 12, padding: '10px 0',
                color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <Ticket size={14} />
                {ev.preco ? `R$ ${ev.preco},00` : 'Entrada gratuita'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Outros eventos */}
      <div style={{ padding: '0 20px' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 14 }}>Próximos eventos</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {outros.map(ev => (
            <div key={ev.id} style={{
              background: '#1e293b', borderRadius: 16, padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
              border: '1px solid #334155',
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14, background: '#0f172a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, flexShrink: 0,
              }}>{ev.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{ev.nome}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <Clock size={11} color="#64748b" />
                  <span style={{ fontSize: 12, color: '#64748b' }}>{ev.data} · {ev.hora}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <MapPin size={11} color="#64748b" />
                  <span style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.local}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <span style={{
                  fontSize: 12, fontWeight: 700,
                  color: ev.preco ? '#0ea5e9' : '#22c55e',
                  background: ev.preco ? '#dbeafe22' : '#dcfce722',
                  borderRadius: 20, padding: '4px 10px',
                }}>
                  {ev.preco ? `R$ ${ev.preco}` : 'Grátis'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
