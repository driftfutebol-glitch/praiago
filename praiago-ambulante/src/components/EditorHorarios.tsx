import { useEffect, useState } from 'react'
import { Clock, Copy, Check, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

// Horário de funcionamento por DIA DA SEMANA.
//
// Antes existia só um par abre/fecha valendo igual pra semana inteira — não
// dava pra dizer "fecho segunda", "sábado abro mais cedo" nem "sou 24 horas",
// que é exatamente como loja de praia funciona.
//
// Compatibilidade: além de gravar a grade nova em `profiles.horarios`, este
// componente CONTINUA gravando `horario_abre`/`horario_fecha` com o horário do
// dia de hoje. Enquanto houver app publicado lendo o formato antigo (o APK na
// mão do cliente demora a atualizar), parar de preencher esses dois campos
// deixaria a loja como "sem horário" pra quem não atualizou.

export type DiaHorario = {
  dia: number // 0 = domingo … 6 = sábado
  aberto: boolean
  abre?: string | null
  fecha?: string | null
  vinte_quatro_horas?: boolean
}

const NOMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
// A ordem de leitura de horário de loja começa na segunda, não no domingo.
const ORDEM = [1, 2, 3, 4, 5, 6, 0]

function grade(abre = '09:00', fecha = '18:00'): DiaHorario[] {
  return Array.from({ length: 7 }, (_, dia) => ({ dia, aberto: true, abre, fecha }))
}

function lerDoBanco(bruto: unknown, abreVelho?: string | null, fechaVelho?: string | null): DiaHorario[] {
  if (Array.isArray(bruto) && bruto.length) {
    const dias: DiaHorario[] = []
    for (let d = 0; d < 7; d++) {
      const achado = (bruto as Record<string, unknown>[]).find(x => Number(x?.dia) === d)
      dias.push(achado
        ? {
            dia: d,
            aberto: achado.aberto !== false,
            abre: typeof achado.abre === 'string' ? achado.abre : '09:00',
            fecha: typeof achado.fecha === 'string' ? achado.fecha : '18:00',
            vinte_quatro_horas: achado.vinte_quatro_horas === true,
          }
        : { dia: d, aberto: false, abre: '09:00', fecha: '18:00' })
    }
    return dias
  }
  // Loja ainda no formato antigo: espalha o par único pelos 7 dias.
  return grade(abreVelho || '09:00', fechaVelho || '18:00')
}

export default function EditorHorarios({
  userId,
  horariosIniciais,
  abreAntigo,
  fechaAntigo,
  accent = '#16a34a',
  onSalvo,
}: {
  userId: string
  horariosIniciais: unknown
  abreAntigo?: string | null
  fechaAntigo?: string | null
  accent?: string
  onSalvo?: (dias: DiaHorario[]) => void
}) {
  const [dias, setDias] = useState<DiaHorario[]>(() => lerDoBanco(horariosIniciais, abreAntigo, fechaAntigo))
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ texto: string; erro: boolean } | null>(null)

  useEffect(() => {
    setDias(lerDoBanco(horariosIniciais, abreAntigo, fechaAntigo))
  }, [horariosIniciais, abreAntigo, fechaAntigo])

  function mudar(dia: number, patch: Partial<DiaHorario>) {
    setDias(atual => atual.map(d => (d.dia === dia ? { ...d, ...patch } : d)))
    setMsg(null)
  }

  /** Copia o horário da segunda pros outros dias — é o atalho que quase todo
   *  mundo quer, porque a maioria abre igual a semana toda. */
  function repetirParaTodos() {
    const base = dias.find(d => d.dia === 1) ?? dias[0]
    setDias(atual => atual.map(d => ({ ...d, aberto: base.aberto, abre: base.abre, fecha: base.fecha, vinte_quatro_horas: base.vinte_quatro_horas })))
    setMsg(null)
  }

  async function salvar() {
    // Um dia aberto sem horário e sem 24h não significa nada — barra antes de
    // gravar pra loja não ficar num estado que o cliente não sabe interpretar.
    const invalido = dias.find(d => d.aberto && !d.vinte_quatro_horas && (!d.abre || !d.fecha))
    if (invalido) {
      setMsg({ texto: `Falta o horário de ${NOMES[invalido.dia].toLowerCase()}.`, erro: true })
      return
    }

    setSalvando(true)
    setMsg(null)

    const limpo = dias.map(d => (d.aberto
      ? (d.vinte_quatro_horas
          ? { dia: d.dia, aberto: true, vinte_quatro_horas: true }
          : { dia: d.dia, aberto: true, abre: d.abre, fecha: d.fecha })
      : { dia: d.dia, aberto: false }))

    // Espelho no formato antigo: pega o dia de hoje; se hoje estiver fechado,
    // usa o primeiro dia aberto da semana pra não gravar nulo.
    const hoje = new Date().getDay()
    const referencia = dias.find(d => d.dia === hoje && d.aberto && !d.vinte_quatro_horas)
      ?? dias.find(d => d.aberto && !d.vinte_quatro_horas)
    const abre24 = dias.some(d => d.aberto && d.vinte_quatro_horas)

    const { error } = await supabase.from('profiles').update({
      horarios: limpo,
      horario_abre: abre24 ? '00:00' : (referencia?.abre ?? null),
      horario_fecha: abre24 ? '00:00' : (referencia?.fecha ?? null),
    }).eq('id', userId)

    setSalvando(false)
    if (error) {
      setMsg({ texto: 'Não foi possível salvar o horário.', erro: true })
      return
    }
    setMsg({ texto: 'Horário salvo. Já vale pros clientes.', erro: false })
    onSalvo?.(dias)
    setTimeout(() => setMsg(null), 5000)
  }

  return (
    <section className="surface" style={{ marginBottom: 14, padding: 15, boxShadow: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={18} color={accent} />
          <div style={{ color: '#132238', fontSize: 14, fontWeight: 900 }}>Horário de funcionamento</div>
        </div>
        <button
          type="button" onClick={repetirParaTodos}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', borderRadius: 10, padding: '7px 11px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}
        >
          <Copy size={13} /> Repetir segunda em todos
        </button>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: '#617089', fontWeight: 600 }}>
        É isso que decide se o cliente vê sua loja como aberta agora.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ORDEM.map(num => {
          const d = dias.find(x => x.dia === num)!
          return (
            <div
              key={num}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: '10px 12px', borderRadius: 13,
                background: d.aberto ? '#f8fafc' : '#f1f5f9',
                border: `1px solid ${d.aberto ? '#e2e8f0' : '#e2e8f0'}`,
                opacity: d.aberto ? 1 : 0.72,
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 116, cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={d.aberto}
                  onChange={e => mudar(num, { aberto: e.target.checked })}
                  style={{ width: 17, height: 17, accentColor: accent, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13.5, fontWeight: 800, color: '#132238' }}>{NOMES[num]}</span>
              </label>

              {!d.aberto ? (
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#94a3b8' }}>Fechado</span>
              ) : d.vinte_quatro_horas ? (
                <span style={{ fontSize: 12.5, fontWeight: 800, color: '#16a34a' }}>Aberto 24 horas</span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="time" value={d.abre ?? ''} onChange={e => mudar(num, { abre: e.target.value })}
                    style={campoHora}
                  />
                  <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>às</span>
                  <input
                    type="time" value={d.fecha ?? ''} onChange={e => mudar(num, { fecha: e.target.value })}
                    style={campoHora}
                  />
                </span>
              )}

              {d.aberto && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', cursor: 'pointer' }}>
                  <input
                    type="checkbox" checked={d.vinte_quatro_horas === true}
                    onChange={e => mudar(num, { vinte_quatro_horas: e.target.checked })}
                    style={{ width: 15, height: 15, accentColor: '#16a34a', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: '#617089' }}>24h</span>
                </label>
              )}
            </div>
          )
        })}
      </div>

      {/* Aviso do caso que mais confunde: fechar depois da meia-noite. */}
      <p style={{ margin: '11px 0 0', fontSize: 11.5, color: '#617089', fontWeight: 600, lineHeight: 1.45 }}>
        Fecha de madrugada? Coloque, por exemplo, <strong>22:00 às 04:00</strong> — o app entende que o
        turno atravessa a meia-noite e mantém a loja aberta.
      </p>

      {msg && (
        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: msg.erro ? '#b42335' : '#148447' }}>
          {msg.texto}
        </div>
      )}

      <button
        type="button" onClick={salvar} disabled={salvando}
        style={{
          width: '100%', marginTop: 14, padding: '13px 0', borderRadius: 14, border: 'none',
          background: accent, color: '#fff', fontSize: 14.5, fontWeight: 900,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          cursor: salvando ? 'wait' : 'pointer',
        }}
      >
        {salvando ? <Loader2 size={17} className="animate-spin-slow" /> : <Check size={17} />}
        {salvando ? 'Salvando…' : 'Salvar horário'}
      </button>
    </section>
  )
}

const campoHora: React.CSSProperties = {
  border: '1px solid #e2e8f0', borderRadius: 10, padding: '7px 9px',
  fontSize: 13.5, fontWeight: 800, color: '#132238', background: '#fff',
}
