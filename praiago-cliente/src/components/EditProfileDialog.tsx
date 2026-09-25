import { useEffect, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'
import FotoPerfilCliente from './FotoPerfilCliente'

export default function EditProfileDialog({ photo, onPhotoChange, onClose }: {
  photo: string | null
  onPhotoChange: (path: string | null) => void
  onClose: () => void
}) {
  const sessao = useStore(s => s.sessao)!
  const [nome, setNome] = useState(sessao.nome)
  const [telefone, setTelefone] = useState(sessao.telefone || '')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialog.current?.showModal()
    let active = true
    void supabase.from('profiles').select('nome,telefone').eq('id', sessao.id).single()
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data) setErro('Não foi possível carregar seus dados. Feche e tente novamente.')
        else { setNome(data.nome || ''); setTelefone(data.telefone || ''); setLoading(false) }
      })
    return () => { active = false }
  }, [sessao.id])

  async function salvar(event: React.FormEvent) {
    event.preventDefault()
    if (saving || loading) return
    const novoNome = nome.trim().replace(/\s+/g, ' ')
    const novoTelefone = telefone.replace(/\D/g, '')
    if (novoNome.length < 2 || novoNome.length > 80) { setErro('Use um nome entre 2 e 80 caracteres.'); return }
    if (novoTelefone && (novoTelefone.length < 10 || novoTelefone.length > 13)) {
      setErro('Informe um telefone com DDD, ou deixe o campo vazio.'); return
    }
    setSaving(true); setErro('')
    try {
      // Apenas campos editáveis do próprio usuário. RLS e regras do servidor continuam valendo.
      const { data, error } = await supabase.from('profiles')
        .update({ nome: novoNome, telefone: novoTelefone || null })
        .eq('id', sessao.id).select('nome,telefone').single()
      if (error || !data) throw error || new Error('Perfil não atualizado')
      useStore.setState(state => ({ sessao: state.sessao?.id === sessao.id
        ? { ...state.sessao, nome: data.nome, telefone: data.telefone || '' } : state.sessao }))
      useStore.getState().addNotif({ titulo: 'Perfil atualizado', texto: 'Seus dados foram salvos com sucesso.' })
      onClose()
    } catch { setErro('Não foi possível salvar. Seus dados anteriores foram mantidos. Tente novamente.') }
    finally { setSaving(false) }
  }

  return <dialog ref={dialog} className="pg-dialog" aria-labelledby="edit-profile-title" onCancel={event => {
    if (saving) event.preventDefault()
    else onClose()
  }} onClose={onClose}>
    <div className="pg-dialog-heading"><div><span className="pg-eyebrow">DO SEU JEITO</span><h2 id="edit-profile-title">Editar perfil</h2></div>
      <button className="pg-icon-button" aria-label="Fechar edição de perfil" disabled={saving} onClick={onClose}><X size={20}/></button>
    </div>
    <FotoPerfilCliente userId={sessao.id} path={photo} onChange={onPhotoChange}/>
    <form onSubmit={salvar} className="pg-form">
      <label>Seu nome<input autoComplete="name" maxLength={80} value={nome} disabled={loading || saving} onChange={e => setNome(e.target.value)} required /></label>
      <label><span>Telefone com DDD <span className="pg-muted">· opcional</span></span><input type="tel" autoComplete="tel" maxLength={20} value={telefone} disabled={loading || saving} onChange={e => setTelefone(e.target.value)} placeholder="(13) 99999-9999"/></label>
      <p className="pg-caption">Usado para contato sobre seus pedidos. E-mail e CPF são protegidos e não são alterados aqui.</p>
      {erro && <p role="alert" className="pg-feedback pg-feedback-error">{erro}</p>}
      <button className="pg-button pg-button-primary" disabled={loading || saving} type="submit">{saving && <Loader2 size={18} className="animate-spin-slow"/>}{saving ? 'Salvando…' : 'Salvar alterações'}</button>
    </form>
  </dialog>
}
