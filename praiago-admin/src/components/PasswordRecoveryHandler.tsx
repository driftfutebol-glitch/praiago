import { useEffect, useState } from 'react'
import { supabase, VEIO_DE_RECOVERY } from '../lib/supabase'

export default function PasswordRecoveryHandler() {
  const [open, setOpen] = useState(VEIO_DE_RECOVERY)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setOpen(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (!open) return null

  async function save() {
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setMessage('Use pelo menos 10 caracteres, com letras e numeros.')
      return
    }
    if (password !== confirmation) {
      setMessage('As senhas nao conferem.')
      return
    }

    setSaving(true)
    setMessage('')
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) {
      setMessage('Nao foi possivel redefinir a senha. Solicite um novo link.')
      return
    }
    await supabase.auth.signOut()
    setMessage('Senha redefinida. Entre novamente.')
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/90 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <h2 className="text-xl font-black text-white">Criar nova senha</h2>
        <div className="mt-5 space-y-3">
          <input
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            placeholder="Nova senha"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-purple-500"
          />
          <input
            type="password"
            value={confirmation}
            onChange={event => setConfirmation(event.target.value)}
            placeholder="Repita a nova senha"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-purple-500"
          />
          <button
            onClick={save}
            disabled={saving}
            className="w-full rounded-lg bg-purple-600 py-3 font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar nova senha'}
          </button>
          {message && <p className="text-sm font-bold text-slate-300">{message}</p>}
          <button
            onClick={() => setOpen(false)}
            className="w-full py-2 text-sm font-bold text-slate-400"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
