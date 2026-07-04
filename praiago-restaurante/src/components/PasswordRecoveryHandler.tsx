// Quando o usuÃ¡rio clica no link "redefinir senha" do e-mail, o Supabase abre
// o app com uma sessÃ£o de recuperaÃ§Ã£o e dispara PASSWORD_RECOVERY. Aqui a
// gente mostra um formulÃ¡rio DE VERDADE (window.prompt nÃ£o abre no Android).
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function PasswordRecoveryHandler() {
  const [aberto, setAberto] = useState(false)
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setAberto(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (!aberto) return null

  async function salvar() {
    if (senha.length < 6) { setMsg('A nova senha precisa ter ao menos 6 caracteres.'); return }
    if (senha !== confirma) { setMsg('As senhas nÃ£o conferem.'); return }
    setMsg('')
    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setSalvando(false)
    if (error) { setMsg(`NÃ£o foi possÃ­vel redefinir: ${error.message}`); return }
    setOk(true)
    setMsg('Senha redefinida com sucesso! Entre com a nova senha.')
    await supabase.auth.signOut()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: '#f8fafc',
    border: '1px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '14px',
    fontSize: 15, fontWeight: 600, color: '#0f172a', outline: 'none', marginBottom: 10,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#ffffff', borderRadius: 24, padding: 26, boxShadow: '0 24px 60px rgba(15,23,42,0.35)' }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', marginBottom: 6 }}>Criar nova senha</div>
        <div style={{ fontSize: 13.5, color: '#64748b', fontWeight: 600, marginBottom: 18, lineHeight: 1.45 }}>
          VocÃª abriu o link de redefiniÃ§Ã£o do PraiaGo. Escolha a nova senha da sua conta.
        </div>
        {!ok && (
          <>
            <input type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Nova senha (mÃ­n. 6 caracteres)" style={inputStyle} />
            <input type="password" value={confirma} onChange={e => setConfirma(e.target.value)} placeholder="Repita a nova senha" style={inputStyle} />
            <button
              onClick={salvar}
              disabled={salvando}
              style={{ width: '100%', border: 'none', background: 'linear-gradient(135deg,#f97316,#f59e0b)', color: '#fff', borderRadius: 14, padding: 15, fontSize: 15, fontWeight: 900, cursor: salvando ? 'wait' : 'pointer', marginTop: 4 }}
            >
              {salvando ? 'Salvandoâ€¦' : 'Salvar nova senha'}
            </button>
          </>
        )}
        {msg && (
          <div style={{ marginTop: 12, fontSize: 13.5, fontWeight: 700, color: ok ? '#16a34a' : '#ef4444' }}>{msg}</div>
        )}
        <button
          onClick={() => setAberto(false)}
          style={{ width: '100%', border: 'none', background: 'transparent', color: '#64748b', padding: '12px 0 0', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
        >
          {ok ? 'Fechar e fazer login' : 'Cancelar'}
        </button>
      </div>
    </div>
  )
}
