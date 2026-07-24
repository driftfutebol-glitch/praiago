import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldAlert, CheckCircle, ChevronDown, ChevronUp, Camera, UploadCloud } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/auth'
import { alertDialog } from '../lib/dialog'

type Status = 'pendente' | 'aprovado' | 'rejeitado' | null

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function isValidCpf(value: string) {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i)
  let digit = 11 - (sum % 11)
  if (digit >= 10) digit = 0
  if (digit !== Number(cpf[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i)
  digit = 11 - (sum % 11)
  if (digit >= 10) digit = 0
  return digit === Number(cpf[10])
}

function isValidCnpj(value: string) {
  const cnpj = onlyDigits(value)
  if (!cnpj) return true
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false
  const calc = (base: string, weights: number[]) => {
    const sum = weights.reduce((acc, weight, i) => acc + Number(base[i]) * weight, 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  const d1 = calc(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = calc(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13])
}

function isAdult(date: string) {
  const birth = new Date(date)
  if (Number.isNaN(birth.getTime())) return false
  const age18 = new Date()
  age18.setFullYear(age18.getFullYear() - 18)
  return birth <= age18 && birth.getFullYear() >= 1900
}

function hasFullName(value: string) {
  return /^[A-Za-zÀ-ÿ]{2,}([ '-][A-Za-zÀ-ÿ]{2,})+$/.test(value.trim())
}

export default function VerificationBar() {
  const sessao = useSessao()
  const [status, setStatus] = useState<Status>(null)
  const [motivo, setMotivo] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  // Form state
  const [nomeCompleto, setNomeCompleto] = useState('')
  const [cpf, setCpf] = useState('')
  const [nascimento, setNascimento] = useState('')
  const [rgFrente, setRgFrente] = useState('')
  const [rgVerso, setRgVerso] = useState('')
  const [selfie, setSelfie] = useState('')
  const [licenca, setLicenca] = useState(true)
  const [praia, setPraia] = useState('Boqueirão')
  const [cnpj, setCnpj] = useState('')

  useEffect(() => {
    if (!sessao) return
    async function fetchStatus() {
      const { data: perfil } = await supabase
        .from('profiles')
        .select('verificado')
        .eq('id', sessao!.id)
        .maybeSingle()

      if (perfil?.verificado === true) {
        setStatus('aprovado')
        setMotivo('')
        setExpanded(false)
        return
      }

      const { data } = await supabase
        .from('verificacoes')
        .select('status, motivo_rejeicao')
        .eq('user_id', sessao!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      
      if (data) {
        setStatus(data.status as Status)
        setMotivo(data.motivo_rejeicao || '')
      }
    }
    fetchStatus()

    const ch = supabase.channel('verif_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verificacoes', filter: `user_id=eq.${sessao.id}` }, () => { fetchStatus() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${sessao.id}` }, () => { fetchStatus() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sessao])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setter(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const submit = async () => {
    if (!sessao) return
    if (!hasFullName(nomeCompleto)) {
      await alertDialog({ title: 'Nome real obrigatorio', message: 'Informe nome e sobrenome reais do responsavel.', tone: 'danger' })
      return
    }
    if (!isValidCpf(cpf)) {
      await alertDialog({ title: 'CPF invalido', message: 'Informe um CPF real antes de enviar a verificacao.', tone: 'danger' })
      return
    }
    if (!isAdult(nascimento)) {
      await alertDialog({ title: 'Data invalida', message: 'A data precisa ser real e o responsavel deve ter pelo menos 18 anos.', tone: 'danger' })
      return
    }
    if (!rgFrente || !rgVerso || !selfie) {
      await alertDialog({ title: 'Documentos obrigatorios', message: 'Envie frente, verso do documento e selfie segurando o documento.', tone: 'danger' })
      return
    }
    if (!isValidCnpj(cnpj)) {
      await alertDialog({ title: 'CNPJ invalido', message: 'Se informar CNPJ/MEI, ele precisa ser valido.', tone: 'danger' })
      return
    }
    setLoading(true)
    const { error } = await supabase.from('verificacoes').insert({
      user_id: sessao.id,
      tipo: 'ambulante',
      nome_completo: nomeCompleto.trim(),
      cpf: onlyDigits(cpf),
      data_nascimento: nascimento,
      rg_frente_url: rgFrente,
      rg_verso_url: rgVerso,
      selfie_url: selfie,
      licenca_ambulante: licenca,
      praia_principal: praia,
      cnpj: onlyDigits(cnpj) || null,
      status: 'pendente'
    })
    setLoading(false)
    if (!error) {
      setStatus('pendente')
      setExpanded(false)
    } else {
      alertDialog({ title: 'Não deu pra enviar', message: 'Tivemos um problema ao enviar sua verificação. Tente de novo em instantes.', tone: 'danger' })
    }
  }

  if (!sessao || status === 'aprovado') return null

  return (
    <div style={{ background: '#eef2f7', borderBottom: '1px solid rgba(0,0,0,0.05)', position: 'relative', zIndex: 50 }}>
      {/* Header Bar */}
      <div 
        onClick={() => status !== 'pendente' && setExpanded(!expanded)}
        style={{ 
          padding: '12px 20px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          background: status === 'rejeitado' ? 'rgba(239, 68, 68, 0.15)' : status === 'pendente' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(14, 165, 233, 0.15)',
          borderBottom: `1px solid ${status === 'rejeitado' ? 'rgba(239,68,68,0.3)' : status === 'pendente' ? 'rgba(245,158,11,0.3)' : 'rgba(14,165,233,0.3)'}`,
          cursor: status === 'pendente' ? 'default' : 'pointer'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {status === 'rejeitado' ? <ShieldAlert color="#ef4444" size={24} /> : 
           status === 'pendente' ? <CheckCircle color="#f59e0b" size={24} /> : 
           <ShieldAlert color="#0ea5e9" size={24} />}
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
              {status === 'pendente' ? 'Análise em Andamento' : 
               status === 'rejeitado' ? 'Verificação Rejeitada' : 
               'Verificação Obrigatória'}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginTop: 2 }}>
              {status === 'pendente' ? 'Aguarde aprovação do administrador.' : 
               status === 'rejeitado' ? 'Corrija os dados e envie novamente.' : 
               'Conclua seu cadastro para vender na praia.'}
            </div>
          </div>
        </div>
        {status !== 'pendente' && (
          <div style={{ padding: 4, background: 'rgba(0,0,0,0.08)', borderRadius: 8 }}>
            {expanded ? <ChevronUp size={20} color="#334155" /> : <ChevronDown size={20} color="#334155" />}
          </div>
        )}
      </div>

      {/* Expanded Form */}
      <AnimatePresence>
        {expanded && status !== 'pendente' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              
              {status === 'rejeitado' && motivo && (
                <div style={{ background: 'rgba(239,68,68,0.1)', padding: 12, borderRadius: 12, border: '1px solid rgba(239,68,68,0.2)' }}>
                  <div style={{ fontSize: 12, color: '#fca5a5', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Motivo da Rejeição:</div>
                  <div style={{ fontSize: 14, color: '#f87171' }}>{motivo}</div>
                </div>
              )}

              {/* Progress Steps */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {[1,2,3,4,5].map(s => (
                  <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: step >= s ? '#0ea5e9' : 'rgba(0,0,0,0.08)' }} />
                ))}
              </div>

              {step === 1 && (
                <div style={stepContainer}>
                  <div style={stepTitle}>Passo 1: Dados Pessoais</div>
                  <input style={inputStyle} placeholder="Nome completo real" value={nomeCompleto} onChange={e => setNomeCompleto(e.target.value)} />
                  <input style={inputStyle} placeholder="CPF (Apenas números)" value={cpf} onChange={e => setCpf(e.target.value)} />
                  <input style={inputStyle} type="date" value={nascimento} onChange={e => setNascimento(e.target.value)} />
                  <button style={btnStyle} onClick={() => setStep(2)}>Próximo</button>
                </div>
              )}

              {step === 2 && (
                <div style={stepContainer}>
                  <div style={stepTitle}>Passo 2: Documento (RG)</div>
                  
                  <label style={uploadBtn}>
                    <UploadCloud size={20} /> Frente do RG
                    <input type="file" hidden accept="image/*" onChange={e => handleFile(e, setRgFrente)} />
                  </label>
                  {rgFrente && <img src={rgFrente} style={previewImg} alt="frente" />}

                  <label style={uploadBtn}>
                    <UploadCloud size={20} /> Verso do RG
                    <input type="file" hidden accept="image/*" onChange={e => handleFile(e, setRgVerso)} />
                  </label>
                  {rgVerso && <img src={rgVerso} style={previewImg} alt="verso" />}

                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <button style={btnStyleGhost} onClick={() => setStep(1)}>Voltar</button>
                    <button style={btnStyle} onClick={() => setStep(3)}>Próximo</button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div style={stepContainer}>
                  <div style={stepTitle}>Passo 3: Face ID</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Tire uma selfie segurando seu documento. (Integração Face ID em breve)</div>
                  
                  <label style={{...uploadBtn, background: 'rgba(34,197,94,0.1)', color: '#4ade80', borderColor: 'rgba(34,197,94,0.3)'}}>
                    <Camera size={20} /> Tirar Selfie
                    <input type="file" hidden accept="image/*" onChange={e => handleFile(e, setSelfie)} />
                  </label>
                  {selfie && <img src={selfie} style={previewImg} alt="selfie" />}

                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <button style={btnStyleGhost} onClick={() => setStep(2)}>Voltar</button>
                    <button style={btnStyle} onClick={() => setStep(4)}>Próximo</button>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div style={stepContainer}>
                  <div style={stepTitle}>Passo 4: Licença e Local</div>
                  
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#0f172a', fontSize: 14 }}>
                    <input type="checkbox" checked={licenca} onChange={e => setLicenca(e.target.checked)} style={{ width: 20, height: 20 }} />
                    Possui licença de ambulante?
                  </label>

                  <select style={inputStyle} value={praia} onChange={e => setPraia(e.target.value)}>
                    <option value="Canto do Forte">Canto do Forte</option>
                    <option value="Boqueirão">Boqueirão</option>
                    <option value="Guilhermina">Guilhermina</option>
                    <option value="Aviação">Aviação</option>
                    <option value="Tupi">Tupi</option>
                    <option value="Ocian">Ocian</option>
                    <option value="Mirim">Mirim</option>
                    <option value="Caiçara">Caiçara</option>
                  </select>

                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <button style={btnStyleGhost} onClick={() => setStep(3)}>Voltar</button>
                    <button style={btnStyle} onClick={() => setStep(5)}>Próximo</button>
                  </div>
                </div>
              )}

              {step === 5 && (
                <div style={stepContainer}>
                  <div style={stepTitle}>Passo 5: CNPJ (Opcional)</div>
                  <input style={inputStyle} placeholder="CNPJ (Se tiver MEI/Empresa)" value={cnpj} onChange={e => setCnpj(e.target.value)} />
                  
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <button style={btnStyleGhost} onClick={() => setStep(4)}>Voltar</button>
                    <button style={{...btnStyle, background: 'linear-gradient(135deg, #0ea5e9, #22c55e)'}} onClick={submit} disabled={loading}>
                      {loading ? 'Enviando...' : 'ENVIAR PARA ANÁLISE'}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '14px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)',
  background: '#ffffff', color: '#0f172a', outline: 'none', fontSize: 14
}
const btnStyle: React.CSSProperties = {
  flex: 1, padding: '14px', borderRadius: 12, border: 'none', background: '#0ea5e9',
  color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer'
}
const btnStyleGhost: React.CSSProperties = {
  flex: 1, padding: '14px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.15)',
  background: 'transparent', color: '#334155', fontWeight: 800, fontSize: 14, cursor: 'pointer'
}
const stepContainer: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 }
const stepTitle: React.CSSProperties = { fontSize: 16, fontWeight: 900, color: '#0f172a', marginBottom: 4 }
const uploadBtn: React.CSSProperties = {
  width: '100%', padding: '16px', borderRadius: 12, border: '1px dashed rgba(0,0,0,0.25)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#1e293b',
  cursor: 'pointer', background: 'rgba(0,0,0,0.03)'
}
const previewImg: React.CSSProperties = {
  width: '100%', height: 120, objectFit: 'cover', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)'
}
