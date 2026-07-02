import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldAlert, CheckCircle, ChevronDown, ChevronUp, Camera, UploadCloud } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/auth'

type Status = 'pendente' | 'aprovado' | 'rejeitado' | null

export default function VerificationBar() {
  const sessao = useSessao()
  const [status, setStatus] = useState<Status>(null)
  const [motivo, setMotivo] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  // Form state
  const [nomeResp, setNomeResp] = useState('')
  const [cpf, setCpf] = useState('')
  const [rg, setRg] = useState('')
  const [selfie, setSelfie] = useState('')
  const [fotoLoja, setFotoLoja] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [razao, setRazao] = useState('')
  const [funcionarios, setFuncionarios] = useState('1')
  const [horario, setHorario] = useState('09:00 as 18:00')
  const [cozinha, setCozinha] = useState('Porções e Frutos do Mar')

  useEffect(() => {
    if (!sessao) return
    async function fetchStatus() {
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

    const ch = supabase.channel('verif_rest_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verificacoes', filter: `user_id=eq.${sessao.id}` }, (payload) => {
        if (payload.new) {
          const newRow = payload.new as any
          setStatus(newRow.status as Status)
          setMotivo(newRow.motivo_rejeicao || '')
        }
      })
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
    setLoading(true)
    const { error } = await supabase.from('verificacoes').insert({
      user_id: sessao.id,
      tipo: 'restaurante',
      nome_completo: nomeResp,
      cpf,
      rg_frente_url: rg,
      selfie_url: selfie,
      foto_loja_url: fotoLoja,
      cnpj,
      razao_social: razao,
      num_funcionarios: parseInt(funcionarios),
      horario_funcionamento: horario,
      tipo_cozinha: cozinha,
      status: 'pendente'
    })
    setLoading(false)
    if (!error) {
      setStatus('pendente')
      setExpanded(false)
    } else {
      alert('Erro ao enviar verificação.')
    }
  }

  if (!sessao || status === 'aprovado') return null

  return (
    <div style={{ background: '#eef2f7', borderBottom: '1px solid rgba(0,0,0,0.05)', position: 'relative', zIndex: 50 }}>
      <div 
        onClick={() => status !== 'pendente' && setExpanded(!expanded)}
        style={{ 
          padding: '16px 32px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          background: status === 'rejeitado' ? 'rgba(239, 68, 68, 0.15)' : status === 'pendente' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(249, 115, 22, 0.15)',
          borderBottom: `1px solid ${status === 'rejeitado' ? 'rgba(239,68,68,0.3)' : status === 'pendente' ? 'rgba(245,158,11,0.3)' : 'rgba(249,115,22,0.3)'}`,
          cursor: status === 'pendente' ? 'default' : 'pointer'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {status === 'rejeitado' ? <ShieldAlert color="#ef4444" size={24} /> : 
           status === 'pendente' ? <CheckCircle color="#f59e0b" size={24} /> : 
           <ShieldAlert color="#f97316" size={24} />}
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
              {status === 'pendente' ? 'Análise em Andamento' : 
               status === 'rejeitado' ? 'Verificação Rejeitada' : 
               'KYC de Restaurante Obrigatório'}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginTop: 2 }}>
              {status === 'pendente' ? 'Aguarde aprovação do administrador.' : 
               status === 'rejeitado' ? 'Corrija os dados da empresa e envie novamente.' : 
               'Conclua a verificação empresarial para operar na plataforma.'}
            </div>
          </div>
        </div>
        {status !== 'pendente' && (
          <div style={{ padding: 4, background: 'rgba(0,0,0,0.08)', borderRadius: 8 }}>
            {expanded ? <ChevronUp size={20} color="#fff" /> : <ChevronDown size={20} color="#fff" />}
          </div>
        )}
      </div>

      <AnimatePresence>
        {expanded && status !== 'pendente' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 600, margin: '0 auto' }}>
              
              {status === 'rejeitado' && motivo && (
                <div style={{ background: 'rgba(239,68,68,0.1)', padding: 12, borderRadius: 12, border: '1px solid rgba(239,68,68,0.2)' }}>
                  <div style={{ fontSize: 12, color: '#fca5a5', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Motivo da Rejeição:</div>
                  <div style={{ fontSize: 14, color: '#f87171' }}>{motivo}</div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {[1,2,3,4,5,6].map(s => (
                  <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: step >= s ? '#f97316' : 'rgba(0,0,0,0.08)' }} />
                ))}
              </div>

              {step === 1 && (
                <div style={stepContainer}>
                  <div style={stepTitle}>Passo 1: Responsável Legal</div>
                  <input style={inputStyle} placeholder="Nome do Responsável" value={nomeResp} onChange={e => setNomeResp(e.target.value)} />
                  <input style={inputStyle} placeholder="CPF do Responsável" value={cpf} onChange={e => setCpf(e.target.value)} />
                  <button style={btnStyle} onClick={() => setStep(2)}>Próximo</button>
                </div>
              )}

              {step === 2 && (
                <div style={stepContainer}>
                  <div style={stepTitle}>Passo 2: Documento (RG/CNH)</div>
                  <label style={uploadBtn}>
                    <UploadCloud size={20} /> Enviar Documento
                    <input type="file" hidden accept="image/*" onChange={e => handleFile(e, setRg)} />
                  </label>
                  {rg && <img src={rg} style={previewImg} alt="rg" />}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button style={btnStyleGhost} onClick={() => setStep(1)}>Voltar</button>
                    <button style={btnStyle} onClick={() => setStep(3)}>Próximo</button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div style={stepContainer}>
                  <div style={stepTitle}>Passo 3: Face ID (Responsável)</div>
                  <label style={{...uploadBtn, background: 'rgba(34,197,94,0.1)', color: '#4ade80', borderColor: 'rgba(34,197,94,0.3)'}}>
                    <Camera size={20} /> Tirar Selfie com Documento
                    <input type="file" hidden accept="image/*" onChange={e => handleFile(e, setSelfie)} />
                  </label>
                  {selfie && <img src={selfie} style={previewImg} alt="selfie" />}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button style={btnStyleGhost} onClick={() => setStep(2)}>Voltar</button>
                    <button style={btnStyle} onClick={() => setStep(4)}>Próximo</button>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div style={stepContainer}>
                  <div style={stepTitle}>Passo 4: Local Físico</div>
                  <label style={uploadBtn}>
                    <Camera size={20} /> Foto da Fachada/Cozinha
                    <input type="file" hidden accept="image/*" onChange={e => handleFile(e, setFotoLoja)} />
                  </label>
                  {fotoLoja && <img src={fotoLoja} style={previewImg} alt="loja" />}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button style={btnStyleGhost} onClick={() => setStep(3)}>Voltar</button>
                    <button style={btnStyle} onClick={() => setStep(5)}>Próximo</button>
                  </div>
                </div>
              )}

              {step === 5 && (
                <div style={stepContainer}>
                  <div style={stepTitle}>Passo 5: Dados da Empresa</div>
                  <input style={inputStyle} placeholder="CNPJ (Obrigatório)" value={cnpj} onChange={e => setCnpj(e.target.value)} />
                  <input style={inputStyle} placeholder="Razão Social" value={razao} onChange={e => setRazao(e.target.value)} />
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button style={btnStyleGhost} onClick={() => setStep(4)}>Voltar</button>
                    <button style={btnStyle} onClick={() => setStep(6)}>Próximo</button>
                  </div>
                </div>
              )}

              {step === 6 && (
                <div style={stepContainer}>
                  <div style={stepTitle}>Passo 6: Operação</div>
                  <input style={inputStyle} placeholder="Número de Funcionários" type="number" value={funcionarios} onChange={e => setFuncionarios(e.target.value)} />
                  <input style={inputStyle} placeholder="Horário de Funcionamento (Ex: 09:00 as 18:00)" value={horario} onChange={e => setHorario(e.target.value)} />
                  <input style={inputStyle} placeholder="Especialidade (Ex: Frutos do Mar)" value={cozinha} onChange={e => setCozinha(e.target.value)} />
                  
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button style={btnStyleGhost} onClick={() => setStep(5)}>Voltar</button>
                    <button style={{...btnStyle, background: 'linear-gradient(135deg, #f97316, #ea580c)'}} onClick={submit} disabled={loading}>
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
  flex: 1, padding: '14px', borderRadius: 12, border: 'none', background: '#f97316',
  color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer'
}
const btnStyleGhost: React.CSSProperties = {
  flex: 1, padding: '14px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.15)',
  background: 'transparent', color: '#334155', fontWeight: 800, fontSize: 14, cursor: 'pointer'
}
const stepContainer: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14 }
const stepTitle: React.CSSProperties = { fontSize: 16, fontWeight: 900, color: '#0f172a', marginBottom: 4 }
const uploadBtn: React.CSSProperties = {
  width: '100%', padding: '16px', borderRadius: 12, border: '1px dashed rgba(0,0,0,0.25)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#1e293b',
  cursor: 'pointer', background: 'rgba(0,0,0,0.03)'
}
const previewImg: React.CSSProperties = {
  width: '100%', height: 160, objectFit: 'cover', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)'
}
