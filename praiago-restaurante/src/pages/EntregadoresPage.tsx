import { useState, useEffect, useRef } from 'react'
import {
  UserPlus, Phone, Bike, Car, Footprints, X, CheckCircle, Clock, MapPin, Search,
  Shield, Upload, Camera, CreditCard, FileText, Loader2, AlertTriangle, XCircle,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/auth'

type Veiculo = 'moto' | 'bicicleta' | 'carro' | 'a_pe'
type StatusEntregador = 'disponivel' | 'em_entrega' | 'offline'
type VerifStatus = 'nao_verificado' | 'pendente' | 'aprovado' | 'rejeitado'

type Entregador = {
  id: string
  restaurante_id: string
  nome: string
  telefone: string
  cpf: string
  veiculo: Veiculo
  status: StatusEntregador
  foto: string | null
  verificacao: VerifStatus
}

const veiculoConfig: Record<Veiculo, { icon: typeof Bike; label: string; emoji: string }> = {
  moto: { icon: Bike, label: 'Moto', emoji: '🏍️' },
  bicicleta: { icon: Bike, label: 'Bicicleta', emoji: '🚴' },
  carro: { icon: Car, label: 'Carro', emoji: '🚗' },
  a_pe: { icon: Footprints, label: 'A pé', emoji: '🚶' },
}

const statusConfig: Record<StatusEntregador, { label: string; bg: string; color: string; border: string }> = {
  disponivel: { label: 'Disponível', bg: 'rgba(34,197,94,0.15)', color: '#4ade80', border: 'rgba(34,197,94,0.3)' },
  em_entrega: { label: 'Em entrega', bg: 'rgba(14,165,233,0.15)', color: '#38bdf8', border: 'rgba(14,165,233,0.3)' },
  offline: { label: 'Offline', bg: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: 'rgba(255,255,255,0.1)' },
}

const verifBadge: Record<VerifStatus, { label: string; bg: string; color: string; border: string; icon: typeof CheckCircle }> = {
  nao_verificado: { label: 'Não Verificado', bg: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: 'rgba(255,255,255,0.1)', icon: Shield },
  pendente: { label: 'Verificando', bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: 'rgba(245,158,11,0.3)', icon: Clock },
  aprovado: { label: 'Verificado', bg: 'rgba(34,197,94,0.15)', color: '#4ade80', border: 'rgba(34,197,94,0.3)', icon: CheckCircle },
  rejeitado: { label: 'Rejeitado', bg: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'rgba(239,68,68,0.3)', icon: XCircle },
}

function formatCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

// ── Verification Modal ──────────────────────────────────────────

function VerificationModal({ entregador, restaurante_id, onClose }: {
  entregador: Entregador
  restaurante_id: string
  onClose: () => void
}) {
  const [activeStep, setActiveStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  // Step files
  const [rgFrente, setRgFrente] = useState<File | null>(null)
  const [rgVerso, setRgVerso] = useState<File | null>(null)
  const [rgFrentePreview, setRgFrentePreview] = useState('')
  const [rgVersoPreview, setRgVersoPreview] = useState('')
  const [selfie, setSelfie] = useState<File | null>(null)
  const [selfiePreview, setSelfiePreview] = useState('')
  const [cnh, setCnh] = useState<File | null>(null)
  const [cnhPreview, setCnhPreview] = useState('')
  const [fotoVeiculo, setFotoVeiculo] = useState<File | null>(null)
  const [fotoVeiculoPreview, setFotoVeiculoPreview] = useState('')

  const rgFrenteRef = useRef<HTMLInputElement>(null)
  const rgVersoRef = useRef<HTMLInputElement>(null)
  const selfieRef = useRef<HTMLInputElement>(null)
  const cnhRef = useRef<HTMLInputElement>(null)
  const veiculoRef = useRef<HTMLInputElement>(null)

  function handleFilePreview(file: File, setter: (url: string) => void) {
    const reader = new FileReader()
    reader.onload = () => setter(reader.result as string)
    reader.readAsDataURL(file)
  }

  const stepDone = [
    !!rgFrente && !!rgVerso,
    !!selfie,
    !!cnh,
    !!fotoVeiculo,
  ]

  const allDone = stepDone.every(Boolean)

  const steps = [
    { icon: CreditCard, title: 'RG / Documento', desc: 'Frente e verso' },
    { icon: Camera, title: 'Selfie', desc: 'Foto do rosto do entregador' },
    { icon: FileText, title: 'CNH', desc: 'Carteira de habilitação (se aplicável)' },
    { icon: Car, title: 'Veículo', desc: 'Foto do veículo utilizado' },
  ]

  async function handleSubmit() {
    if (!allDone) return
    setSubmitting(true)
    try {
      const { data, error } = await supabase.from('verificacoes').insert({
        user_id: restaurante_id, // Atrelado ao restaurante
        tipo: 'entregador',
        restaurante_id: restaurante_id,
        nome_completo: entregador.nome,
        cpf: entregador.cpf,
        rg_frente_url: rgFrentePreview,
        rg_verso_url: rgVersoPreview,
        selfie_url: selfiePreview,
        cnh_url: cnhPreview,
        tipo_veiculo: entregador.veiculo,
        status: 'pendente'
      }).select().single()

      if (error) throw error

      if (data) {
        await supabase.from('entregadores').update({ verificacao_id: data.id, status: 'pendente' }).eq('id', entregador.id)
      }
      onClose()
    } catch (err) {
      console.error('Erro ao enviar verificação:', err)
      alert('Erro ao enviar. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  function FileUploadArea({ file, preview, inputRef, setFile, setPreview, label, height = 140 }: {
    file: File | null; preview: string; inputRef: React.RefObject<HTMLInputElement | null>
    setFile: (f: File) => void; setPreview: (u: string) => void; label: string; height?: number
  }) {
    return (
      <div>
        <input ref={inputRef} type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); handleFilePreview(f, setPreview) } }} style={{ display: 'none' }} />
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => inputRef.current?.click()} style={{
          width: '100%', height: preview ? 'auto' : height, borderRadius: 16,
          border: `2px dashed ${file ? 'rgba(249,115,22,0.4)' : 'rgba(255,255,255,0.15)'}`,
          background: file ? 'rgba(249,115,22,0.05)' : 'rgba(255,255,255,0.02)',
          cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
          overflow: 'hidden', padding: preview ? 0 : 16,
        }}>
          {preview ? (
            <img src={preview} alt={label} style={{ width: '100%', height: height, objectFit: 'cover', borderRadius: 14 }} />
          ) : (
            <>
              <Upload size={24} color="#64748b" />
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{label}</span>
            </>
          )}
        </motion.button>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(10px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="glass-panel"
        style={{ borderRadius: 24, width: '100%', maxWidth: 520, padding: 32, border: '1px solid rgba(249,115,22,0.3)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Shield size={22} color="#f97316" /> Verificar Entregador
            </h2>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>{entregador.nome} — {entregador.cpf}</p>
          </div>
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 8, cursor: 'pointer' }}>
            <X size={20} color="#cbd5e1" />
          </motion.button>
        </div>

        {/* Step tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {steps.map((step, i) => {
            const Icon = step.icon
            const done = stepDone[i]
            const isActive = activeStep === i
            return (
              <motion.button key={i} whileTap={{ scale: 0.98 }} onClick={() => setActiveStep(i)} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '10px 8px', borderRadius: 14,
                background: isActive ? 'rgba(249,115,22,0.15)' : done ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isActive ? 'rgba(249,115,22,0.4)' : done ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)'}`,
                color: isActive ? '#f97316' : done ? '#4ade80' : '#64748b',
                cursor: 'pointer', fontSize: 10, fontWeight: 700,
              }}>
                {done ? <CheckCircle size={16} /> : <Icon size={16} />}
                {step.title.split(' ')[0]}
              </motion.button>
            )
          })}
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div key={activeStep} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              {(() => { const Icon = steps[activeStep].icon; return <Icon size={18} color="#f97316" /> })()}
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc' }}>{steps[activeStep].title}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{steps[activeStep].desc}</div>
              </div>
            </div>

            {activeStep === 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Frente do RG *</label>
                  <FileUploadArea file={rgFrente} preview={rgFrentePreview} inputRef={rgFrenteRef} setFile={setRgFrente} setPreview={setRgFrentePreview} label="Enviar frente" />
                </div>
                <div>
                  <label style={labelStyle}>Verso do RG *</label>
                  <FileUploadArea file={rgVerso} preview={rgVersoPreview} inputRef={rgVersoRef} setFile={setRgVerso} setPreview={setRgVersoPreview} label="Enviar verso" />
                </div>
              </div>
            )}

            {activeStep === 1 && (
              <FileUploadArea file={selfie} preview={selfiePreview} inputRef={selfieRef} setFile={setSelfie} setPreview={setSelfiePreview} label="Tirar selfie ou enviar foto" height={180} />
            )}

            {activeStep === 2 && (
              <div>
                <div style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)', borderRadius: 14, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={14} color="#38bdf8" />
                  <span style={{ fontSize: 11, color: '#7dd3fc', fontWeight: 500 }}>
                    {entregador.veiculo === 'a_pe' || entregador.veiculo === 'bicicleta' ? 'Se não possuir CNH, envie qualquer documento com foto.' : 'Obrigatório para veículos motorizados.'}
                  </span>
                </div>
                <FileUploadArea file={cnh} preview={cnhPreview} inputRef={cnhRef} setFile={setCnh} setPreview={setCnhPreview} label="Enviar CNH ou documento" height={160} />
              </div>
            )}

            {activeStep === 3 && (
              <FileUploadArea file={fotoVeiculo} preview={fotoVeiculoPreview} inputRef={veiculoRef} setFile={setFotoVeiculo} setPreview={setFotoVeiculoPreview} label="Foto do veículo" height={180} />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          {activeStep > 0 ? (
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => setActiveStep(s => s - 1)} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 14, padding: '10px 20px', color: '#94a3b8', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>Anterior</motion.button>
          ) : <div />}
          {activeStep < 3 ? (
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => setActiveStep(s => s + 1)} style={{
              background: 'linear-gradient(135deg, #f97316, #ea580c)',
              border: 'none', borderRadius: 14, padding: '10px 24px',
              color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(249,115,22,0.3)',
            }}>Próximo</motion.button>
          ) : null}
        </div>

        {/* Submit */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSubmit}
          disabled={submitting || !allDone}
          style={{
            width: '100%',
            background: allDone ? 'linear-gradient(135deg, #f97316, #ea580c)' : 'rgba(255,255,255,0.05)',
            border: 'none', borderRadius: 16, padding: '14px 0',
            color: allDone ? '#fff' : '#64748b',
            fontSize: 14, fontWeight: 900, cursor: allDone ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: allDone ? '0 8px 25px rgba(249,115,22,0.3)' : 'none',
            opacity: submitting ? 0.7 : 1, letterSpacing: 1,
          }}
        >
          {submitting ? (
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
              <Loader2 size={18} />
            </motion.div>
          ) : (
            <Shield size={18} />
          )}
          {submitting ? 'ENVIANDO...' : 'ENVIAR VERIFICAÇÃO'}
        </motion.button>
      </motion.div>
    </div>
  )
}

// ── Add Driver Form Modal ───────────────────────────────────────

function FormModal({ onClose, onSave }: { onClose: () => void; onSave: (e: Omit<Entregador, 'id' | 'foto' | 'verificacao' | 'restaurante_id' | 'status'>) => void }) {
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cpf, setCpfLocal] = useState('')
  const [veiculo, setVeiculo] = useState<Veiculo>('moto')

  function submit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!nome.trim() || !telefone.trim() || cpf.replace(/\D/g, '').length !== 11) return
    onSave({ nome: nome.trim(), telefone: telefone.trim(), cpf: cpf.trim(), veiculo })
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(10px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="glass-panel" style={{ borderRadius: 24, width: '100%', maxWidth: 440, padding: 32, border: '1px solid rgba(249,115,22,0.3)', boxShadow: '0 20px 60px rgba(0,0,0,0.5), inset 0 0 20px rgba(249,115,22,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <UserPlus size={22} color="#f97316" /> Cadastrar Entregador
            </h2>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>Expanda sua equipe própria</p>
          </div>
          <motion.button whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.1)' }} whileTap={{ scale: 0.9 }} onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 8, cursor: 'pointer' }}>
            <X size={20} color="#cbd5e1" />
          </motion.button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>NOME COMPLETO *</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: João Silva" required style={inputStyle}
              onFocus={(e) => e.target.style.border = '1px solid rgba(249,115,22,0.5)'}
              onBlur={(e) => e.target.style.border = '1px solid rgba(255,255,255,0.1)'} />
          </div>

          <div>
            <label style={labelStyle}>TELEFONE *</label>
            <input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(13) 9 0000-0000" required style={inputStyle}
              onFocus={(e) => e.target.style.border = '1px solid rgba(249,115,22,0.5)'}
              onBlur={(e) => e.target.style.border = '1px solid rgba(255,255,255,0.1)'} />
          </div>

          <div>
            <label style={labelStyle}>CPF *</label>
            <input value={cpf} onChange={e => setCpfLocal(formatCPF(e.target.value))} placeholder="000.000.000-00" required style={inputStyle}
              onFocus={(e) => e.target.style.border = '1px solid rgba(249,115,22,0.5)'}
              onBlur={(e) => e.target.style.border = '1px solid rgba(255,255,255,0.1)'} />
          </div>

          <div>
            <label style={labelStyle}>TIPO DE VEÍCULO</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {(Object.keys(veiculoConfig) as Veiculo[]).map(v => (
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} key={v} type="button" onClick={() => setVeiculo(v)} style={{
                  padding: '12px 10px', borderRadius: 14, cursor: 'pointer',
                  background: veiculo === v ? 'rgba(249,115,22,0.1)' : 'rgba(255,255,255,0.02)',
                  border: veiculo === v ? '1px solid rgba(249,115,22,0.5)' : '1px solid rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 14, fontWeight: veiculo === v ? 800 : 600,
                  color: veiculo === v ? '#f97316' : '#94a3b8',
                  transition: 'all 0.2s', boxShadow: veiculo === v ? '0 0 15px rgba(249,115,22,0.2)' : 'none',
                }}>
                  <span style={{ fontSize: 20 }}>{veiculoConfig[v].emoji}</span>
                  {veiculoConfig[v].label}
                </motion.button>
              ))}
            </div>
          </div>

          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" style={{
            marginTop: 10, padding: '16px 0',
            background: 'linear-gradient(135deg, #f97316, #ea580c)',
            border: 'none', borderRadius: 16, fontSize: 15, fontWeight: 900, letterSpacing: 1,
            color: '#fff', cursor: 'pointer', boxShadow: '0 8px 25px rgba(249,115,22,0.4)', textShadow: '0 1px 2px rgba(0,0,0,0.2)',
          }}>
            CADASTRAR ENTREGADOR
          </motion.button>
        </form>
      </motion.div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────

export default function EntregadoresPage() {
  const sessao = useSessao()
  const [entregadores, setEntregadores] = useState<Entregador[]>([])
  const [showForm, setShowForm] = useState(false)
  const [showVerif, setShowVerif] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (!sessao) return
    async function load() {
      // 1. Carrega todos os entregadores desse restaurante
      const { data: entrs } = await supabase.from('entregadores').select('*').eq('restaurante_id', sessao!.id)
      if (!entrs) return

      // 2. Transforma para o formato do app (já puxando o status da verificação caso exista)
      const mapped = await Promise.all(entrs.map(async (e: any) => {
        let vStatus: VerifStatus = e.status === 'pendente' ? 'pendente' : 'nao_verificado'
        if (e.verificacao_id) {
          const { data: verif } = await supabase.from('verificacoes').select('status').eq('id', e.verificacao_id).maybeSingle()
          if (verif) vStatus = verif.status as VerifStatus
        }

        return {
          id: e.id,
          restaurante_id: e.restaurante_id,
          nome: e.nome,
          telefone: e.telefone,
          cpf: e.cpf,
          veiculo: (e.veiculo || 'moto') as Veiculo,
          status: 'offline' as StatusEntregador, // todos offline no início local
          foto: null,
          verificacao: vStatus
        }
      }))
      setEntregadores(mapped)
    }
    load()
  }, [sessao])

  async function addEntregador(data: Omit<Entregador, 'id' | 'foto' | 'verificacao' | 'restaurante_id' | 'status'>) {
    if (!sessao) return
    const { data: novoEnt, error } = await supabase.from('entregadores').insert({
      restaurante_id: sessao.id,
      nome: data.nome,
      telefone: data.telefone,
      cpf: data.cpf.replace(/\D/g, ''),
      veiculo: data.veiculo,
      status: 'pendente'
    }).select().single()

    if (error) {
      console.error(error)
      alert('Erro ao criar entregador')
      return
    }

    setEntregadores(prev => [...prev, {
      id: novoEnt.id,
      restaurante_id: sessao.id,
      ...data,
      status: 'offline',
      foto: null,
      verificacao: 'nao_verificado'
    }])
  }

  async function removeEntregador(id: string) {
    await supabase.from('entregadores').delete().eq('id', id)
    setEntregadores(prev => prev.filter(e => e.id !== id))
  }

  function cycleStatus(id: string) {
    const e = entregadores.find(x => x.id === id)
    if (!e) return
    if (e.verificacao !== 'aprovado' && e.status === 'offline') return // Need verification to be online

    const cycle: Record<StatusEntregador, StatusEntregador> = {
      disponivel: 'offline', em_entrega: 'disponivel', offline: 'disponivel',
    }
    setEntregadores(prev => prev.map(x => x.id === id ? { ...x, status: cycle[x.status] } : x))
  }

  const disponiveis = entregadores.filter(e => e.status === 'disponivel').length
  const emEntrega = entregadores.filter(e => e.status === 'em_entrega').length
  const verificados = entregadores.filter(e => e.verificacao === 'aprovado').length
  const filteredEntregadores = entregadores.filter(e => e.nome.toLowerCase().includes(searchTerm.toLowerCase()))

  const verifEntregador = entregadores.find(e => e.id === showVerif)

  if (!sessao) return null

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 48 }}>
      <AnimatePresence>
        {showForm && <FormModal onClose={() => setShowForm(false)} onSave={addEntregador} />}
      </AnimatePresence>

      <AnimatePresence>
        {verifEntregador && (
          <VerificationModal
            entregador={verifEntregador}
            restaurante_id={sessao.id}
            onClose={() => setShowVerif(null)}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ padding: '32px 40px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 38, fontWeight: 900, color: '#f8fafc', margin: '0 0 8px', letterSpacing: -1, textShadow: '0 0 30px rgba(255,255,255,0.1)' }}>Equipe Tática</h1>
          <p style={{ fontSize: 15, color: '#94a3b8', margin: 0, fontWeight: 500 }}>Gestão da sua frota própria de entregas</p>
        </div>
        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setShowForm(true)} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'linear-gradient(135deg, #f97316, #ea580c)',
          border: 'none', borderRadius: 20, padding: '14px 24px',
          color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
          boxShadow: '0 8px 25px rgba(249,115,22,0.4)', textShadow: '0 1px 2px rgba(0,0,0,0.2)',
        }}>
          <UserPlus size={18} /> NOVO ENTREGADOR
        </motion.button>
      </motion.div>

      {/* Stats e Busca */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} style={{ padding: '0 40px 32px', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { n: entregadores.length, l: 'TOTAL', bg: 'rgba(255,255,255,0.05)', c: '#f8fafc', b: 'rgba(255,255,255,0.1)' },
            { n: disponiveis, l: 'DISPONÍVEIS', bg: 'rgba(34,197,94,0.1)', c: '#4ade80', b: 'rgba(34,197,94,0.2)' },
            { n: emEntrega, l: 'EM ROTA', bg: 'rgba(14,165,233,0.1)', c: '#38bdf8', b: 'rgba(14,165,233,0.2)' },
            { n: verificados, l: 'VERIFICADOS', bg: 'rgba(249,115,22,0.1)', c: '#f97316', b: 'rgba(249,115,22,0.2)' },
          ].map(s => (
            <div key={s.l} className="glass-panel" style={{ background: s.bg, border: `1px solid ${s.b}`, borderRadius: 16, padding: '12px 24px', textAlign: 'center', minWidth: 100 }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: s.c, textShadow: `0 0 15px ${s.c}80` }}>{s.n}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, fontWeight: 800, letterSpacing: 1 }}>{s.l}</div>
            </div>
          ))}
        </div>

        <div className="glass-panel" style={{ flex: 1, minWidth: 300, borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', padding: '0 20px', background: 'rgba(0,0,0,0.2)' }}>
          <Search size={20} color="#64748b" />
          <input
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar entregador pelo nome..."
            style={{ width: '100%', background: 'transparent', border: 'none', color: '#f8fafc', padding: '16px 12px', fontSize: 15, outline: 'none' }}
          />
        </div>
      </motion.div>

      {/* Lista */}
      <div style={{ padding: '0 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {entregadores.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center', padding: '80px 0', color: '#94a3b8' }}>
            <div style={{ fontSize: 64, marginBottom: 20, filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.5))' }}>🛵</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#f8fafc', marginBottom: 8 }}>Sua frota está vazia</div>
            <div style={{ fontSize: 15, color: '#64748b' }}>Cadastre sua equipe para gerenciar as entregas no radar.</div>
          </motion.div>
        )}

        <AnimatePresence>
          {filteredEntregadores.map((e, idx) => {
            const st = statusConfig[e.status]
            const vc = veiculoConfig[e.veiculo]
            const vb = verifBadge[e.verificacao]
            const VbIcon = vb.icon
            return (
              <motion.div layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: idx * 0.05 }} key={e.id} className="glass-panel" style={{
                borderRadius: 20, padding: '24px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                border: `1px solid ${e.status === 'em_entrega' ? 'rgba(14,165,233,0.3)' : 'rgba(255,255,255,0.05)'}`,
                display: 'flex', alignItems: 'center', gap: 24, position: 'relative', overflow: 'hidden',
              }}>
                {e.status === 'em_entrega' && <div className="animate-pulse-neon" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: '#38bdf8', boxShadow: '0 0 15px #38bdf8' }} />}

                {/* Avatar */}
                <div style={{
                  width: 64, height: 64, borderRadius: 20, flexShrink: 0,
                  background: 'linear-gradient(135deg, rgba(249,115,22,0.2), rgba(234,88,12,0.05))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, fontWeight: 700, border: '1px solid rgba(249,115,22,0.3)',
                  boxShadow: 'inset 0 0 20px rgba(249,115,22,0.1)', position: 'relative',
                }}>
                  {e.foto ? (
                    <img src={e.foto} alt={e.nome} style={{ width: '100%', height: '100%', borderRadius: 18, objectFit: 'cover' }} />
                  ) : (
                    <span style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.4))' }}>{vc.emoji}</span>
                  )}
                  {e.verificacao === 'aprovado' && (
                    <div style={{ position: 'absolute', bottom: -4, right: -4, background: '#22c55e', borderRadius: '50%', padding: 3, display: 'flex', border: '2px solid #0f172a' }}>
                      <CheckCircle size={12} color="#fff" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color: '#f8fafc' }}>{e.nome}</span>
                    <span style={{
                      background: st.bg, color: st.color, border: `1px solid ${st.border}`, borderRadius: 12,
                      padding: '4px 12px', fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
                    }}>{st.label.toUpperCase()}</span>
                    <span style={{
                      background: vb.bg, color: vb.color, border: `1px solid ${vb.border}`, borderRadius: 12,
                      padding: '4px 12px', fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <VbIcon size={12} /> {vb.label.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
                      <Phone size={14} color="#64748b" /> {e.telefone}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
                      <CreditCard size={14} color="#64748b" /> {e.cpf}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
                      <span style={{ fontSize: 14 }}>{vc.emoji}</span> {vc.label}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
                  {e.verificacao !== 'aprovado' && e.verificacao !== 'pendente' && (
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setShowVerif(e.id)} style={{
                      background: 'linear-gradient(135deg, rgba(249,115,22,0.15), rgba(234,88,12,0.1))',
                      border: '1px solid rgba(249,115,22,0.3)', borderRadius: 14,
                      padding: '10px 18px', fontSize: 12, fontWeight: 800, color: '#f97316',
                      cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <Shield size={14} /> VERIFICAR
                    </motion.button>
                  )}
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    onClick={() => cycleStatus(e.id)}
                    title={e.verificacao !== 'aprovado' && e.status === 'offline' ? 'Verificação necessária para ativar' : ''}
                    style={{
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14,
                      padding: '10px 20px', fontSize: 13, fontWeight: 800, color: '#e2e8f0',
                      cursor: (e.verificacao !== 'aprovado' && e.status === 'offline') ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap', transition: 'background 0.2s',
                      opacity: (e.verificacao !== 'aprovado' && e.status === 'offline') ? 0.5 : 1,
                    }}
                  >
                    {e.status === 'offline' ? 'ATIVAR' : 'MUDAR STATUS'}
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.1, backgroundColor: 'rgba(239,68,68,0.2)' }} whileTap={{ scale: 0.9 }} onClick={() => removeEntregador(e.id)} style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 14,
                    padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <X size={18} color="#f87171" />
                  </motion.button>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>

        <AnimatePresence>
          {entregadores.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel" style={{
              background: 'linear-gradient(135deg, rgba(249,115,22,0.1), rgba(234,88,12,0.02))',
              border: '1px solid rgba(249,115,22,0.2)', borderRadius: 20, padding: '20px 24px',
              marginTop: 16, boxShadow: 'inset 0 0 20px rgba(249,115,22,0.05)',
            }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(249,115,22,0.2)', padding: 10, borderRadius: 12 }}>
                  <MapPin size={24} color="#f97316" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc', marginBottom: 6, letterSpacing: 0.5 }}>
                    Rastreamento Ao Vivo via Satélite
                  </div>
                  <div style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.6, fontWeight: 500 }}>
                    Monitore a sua equipe no <b style={{ color: '#f97316' }}>Radar Tático</b>. A posição dos entregadores será sincronizada instantaneamente assim que eles abrirem o app no celular.
                    {' '}<b style={{ color: '#fbbf24' }}>Somente entregadores verificados</b> podem ser ativados para entregas.
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, color: '#94a3b8', display: 'block',
  marginBottom: 8, letterSpacing: 1,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '14px 16px', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 14, background: 'rgba(0,0,0,0.3)', color: '#f8fafc',
  fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  transition: 'border 0.2s',
}
