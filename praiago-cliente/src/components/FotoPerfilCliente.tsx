import { useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, Trash2, User } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { CARTAO } from './ui'
import {
  ACCEPT_FOTO,
  BUCKET_FOTOS,
  caminhoFotoPerfil,
  urlFotoPerfil,
  validarFoto,
} from '../lib/fotoPerfil'

type Props = {
  userId: string
  /** Caminho atual em `profiles.foto_perfil_path` (relativo ao bucket). */
  path: string | null
  /** Avisa a tela do perfil pra ela atualizar o avatar do cabeçalho junto. */
  onChange: (path: string | null) => void
}

// Diâmetro do avatar. Fixo em pixel de propósito: caixa de foto com
// `aspectRatio` e sem teto de largura vira um quadrado gigante em tela grande.
const TAMANHO = 92

/**
 * Cartão de foto de perfil do cliente. O cliente tem UMA foto só (não existe
 * capa de vitrine como no app do restaurante).
 */
export default function FotoPerfilCliente({ userId, path, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null)

  const url = urlFotoPerfil(path)

  async function enviar(evento: React.ChangeEvent<HTMLInputElement>) {
    const file = evento.target.files?.[0]
    // Limpa o input ANTES de qualquer return: sem isso, escolher o mesmo
    // arquivo de novo não dispara `change` e a tela parece travada.
    evento.target.value = ''
    if (!file) return

    const problema = validarFoto(file)
    if (problema) {
      setAviso({ texto: problema, erro: true })
      return
    }

    setOcupado(true)
    setAviso(null)
    const anterior = path
    const novo = caminhoFotoPerfil(userId, file)
    try {
      const { error: erroUpload } = await supabase.storage
        .from(BUCKET_FOTOS)
        .upload(novo, file, { contentType: file.type, upsert: false })
      if (erroUpload) throw erroUpload

      const { error: erroPerfil } = await supabase
        .from('profiles')
        .update({ foto_perfil_path: novo })
        .eq('id', userId)
      if (erroPerfil) {
        // Rollback: sem isso o arquivo ficaria órfão no bucket, contando espaço
        // e sem nenhum perfil apontando pra ele.
        await supabase.storage.from(BUCKET_FOTOS).remove([novo])
        throw erroPerfil
      }

      // Só apaga a antiga depois que o perfil já aponta pra nova — se apagasse
      // antes e o update falhasse, o usuário ficaria sem foto nenhuma. O
      // `startsWith` é cinto de segurança: nunca tentar apagar fora da pasta
      // do próprio usuário.
      if (anterior && anterior.startsWith(`${userId}/`)) {
        await supabase.storage.from(BUCKET_FOTOS).remove([anterior])
      }

      onChange(novo)
      setAviso({ texto: 'Foto atualizada.', erro: false })
    } catch (error) {
      console.error('Erro ao atualizar a foto de perfil:', error)
      setAviso({ texto: 'Não foi possível atualizar a foto. Tente de novo.', erro: true })
    } finally {
      setOcupado(false)
    }
  }

  async function remover() {
    if (!path) return
    setOcupado(true)
    setAviso(null)
    const { error } = await supabase
      .from('profiles')
      .update({ foto_perfil_path: null })
      .eq('id', userId)
    if (error) {
      console.error('Erro ao remover a foto de perfil:', error)
      setOcupado(false)
      setAviso({ texto: 'Não foi possível remover a foto.', erro: true })
      return
    }
    if (path.startsWith(`${userId}/`)) {
      await supabase.storage.from(BUCKET_FOTOS).remove([path])
    }
    onChange(null)
    setOcupado(false)
    setAviso({ texto: 'Foto removida.', erro: false })
  }

  return (
    <section style={{ ...CARTAO, padding: 18, marginBottom: 20 }}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_FOTO}
        onChange={enviar}
        style={{ display: 'none' }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Camera size={18} color="#0284c7" strokeWidth={2.4} />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 950, color: '#0f172a' }}>Foto de perfil</h3>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={ocupado}
          aria-label={path ? 'Trocar foto de perfil' : 'Escolher foto de perfil'}
          style={{
            position: 'relative',
            flexShrink: 0,
            width: TAMANHO,
            height: TAMANHO,
            padding: 0,
            display: 'grid',
            placeItems: 'center',
            overflow: 'hidden',
            borderRadius: '50%',
            border: url ? '2px solid #eef2f7' : '2px dashed #cbd5e1',
            background: url ? '#eef2f7' : 'linear-gradient(140deg, #e0f2fe, #dcfce7)',
            color: '#0284c7',
            cursor: ocupado ? 'wait' : 'pointer',
          }}
        >
          {ocupado
            ? <Loader2 size={24} className="animate-spin-slow" />
            : url
              ? <img src={url} alt="Sua foto de perfil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <ImagePlus size={26} strokeWidth={2.2} />}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#64748b', lineHeight: 1.45 }}>
            {path
              ? 'É assim que você aparece nos seus pedidos.'
              : 'Escolha uma foto pra aparecer no seu perfil e nos pedidos.'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={ocupado}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 14px',
                borderRadius: 999,
                border: 0,
                background: '#0284c7',
                color: '#ffffff',
                fontSize: 12.5,
                fontWeight: 900,
                cursor: ocupado ? 'wait' : 'pointer',
                opacity: ocupado ? 0.65 : 1,
              }}
            >
              <Camera size={14} strokeWidth={2.6} />
              {path ? 'Trocar foto' : 'Escolher foto'}
            </button>
            {path && (
              <button
                type="button"
                onClick={() => void remover()}
                disabled={ocupado}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '9px 14px',
                  borderRadius: 999,
                  border: '1px solid #fecaca',
                  background: '#ffffff',
                  color: '#b91c1c',
                  fontSize: 12.5,
                  fontWeight: 900,
                  cursor: ocupado ? 'wait' : 'pointer',
                  opacity: ocupado ? 0.65 : 1,
                }}
              >
                <Trash2 size={14} strokeWidth={2.6} />
                Remover
              </button>
            )}
          </div>
        </div>
      </div>

      {aviso && (
        <div style={{ marginTop: 12, fontSize: 12, fontWeight: 800, color: aviso.erro ? '#b91c1c' : '#16a34a' }}>
          {aviso.texto}
        </div>
      )}
    </section>
  )
}

/**
 * Avatar redondo só de leitura, usado no cabeçalho do perfil (fundo colorido).
 * Fica aqui junto do cartão pra os dois lerem a foto do mesmo jeito.
 */
export function AvatarPerfil({ path, tamanho = 64 }: { path: string | null; tamanho?: number }) {
  const url = urlFotoPerfil(path)
  return (
    <div
      style={{
        flexShrink: 0,
        width: tamanho,
        height: tamanho,
        borderRadius: '50%',
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(255,255,255,0.2)',
        border: '3px solid rgba(255,255,255,0.6)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        backdropFilter: 'blur(10px)',
      }}
    >
      {url
        ? <img src={url} alt="Sua foto de perfil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <User size={tamanho * 0.5} color="#ffffff" strokeWidth={2.2} />}
    </div>
  )
}
