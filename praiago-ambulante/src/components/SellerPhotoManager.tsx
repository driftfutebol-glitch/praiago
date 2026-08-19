import { Camera, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { SELLER_PHOTO_BUCKET } from '../lib/sellerPhotos'

type PhotoKind = 'perfil' | 'capa'

type Props = {
  userId: string
  profilePath: string | null
  coverPath: string | null
  accent?: string
  onChanged?: (paths: { profilePath: string | null; coverPath: string | null }) => void
}

// Aceita o que celular de verdade produz. O HEIC/HEIF é o formato PADRÃO da
// câmera do iPhone — sem ele na lista, quem chega com iPhone (boa parte das
// pessoas) simplesmente não consegue subir a foto da loja. O iOS costuma
// converter pra JPEG ao escolher pelo seletor de arquivos, mas nem sempre, e
// quando não converte o upload morria com "use uma imagem JPG, PNG ou WebP".
const ALLOWED_TYPES = [
  'image/jpeg', 'image/jpg', 'image/pjpeg',
  'image/png', 'image/webp', 'image/gif', 'image/avif',
  'image/heic', 'image/heif',
]
// Vai no atributo `accept` do input: define o que o seletor do celular mostra.
const ACCEPT = ALLOWED_TYPES.join(',') + ',image/*'

function extension(file: File) {
  const porTipo: Record<string, string> = {
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'image/heic': 'heic',
    'image/heif': 'heif',
  }
  if (porTipo[file.type]) return porTipo[file.type]
  // Sem tipo confiável (acontece em WebView antigo), cai pra extensão do nome.
  const doNome = file.name.split('.').pop()?.toLowerCase()
  if (doNome && /^(png|webp|gif|avif|heic|heif|jpe?g)$/.test(doNome)) return doNome === 'jpeg' ? 'jpg' : doNome
  return 'jpg'
}

export default function SellerPhotoManager({ userId, profilePath, coverPath, accent = '#008fc0', onChanged }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [paths, setPaths] = useState({ profilePath, coverPath })
  const [target, setTarget] = useState<PhotoKind>('perfil')
  const [busy, setBusy] = useState<PhotoKind | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => setPaths({ profilePath, coverPath }), [coverPath, profilePath])

  function emit(next: typeof paths) {
    setPaths(next)
    onChanged?.(next)
  }

  function choose(kind: PhotoKind) {
    setTarget(kind)
    inputRef.current?.click()
  }

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    // `file.type` vazio acontece em WebView antigo e em alguns gerenciadores de
    // arquivo. Recusar nesse caso barrava foto legítima, então quando não há
    // tipo a gente deixa passar e confia na validação do bucket.
    if (file.type && !ALLOWED_TYPES.includes(file.type.toLowerCase())) {
      setMessage({ text: 'Esse arquivo não é uma imagem. Escolha uma foto.', error: true })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ text: 'A imagem deve ter no máximo 5 MB.', error: true })
      return
    }

    setBusy(target)
    setMessage(null)
    const oldPath = target === 'perfil' ? paths.profilePath : paths.coverPath
    const path = `${userId}/${target}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension(file)}`
    const field = target === 'perfil' ? 'foto_perfil_path' : 'foto_capa_path'
    try {
      const { error: uploadError } = await supabase.storage.from(SELLER_PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
      if (uploadError) throw uploadError

      const { error: profileError } = await supabase.from('profiles').update({ [field]: path }).eq('id', userId)
      if (profileError) {
        await supabase.storage.from(SELLER_PHOTO_BUCKET).remove([path])
        throw profileError
      }

      if (oldPath?.startsWith(`${userId}/`)) await supabase.storage.from(SELLER_PHOTO_BUCKET).remove([oldPath])
      const next = target === 'perfil'
        ? { ...paths, profilePath: path }
        : { ...paths, coverPath: path }
      emit(next)
      setMessage({ text: 'Imagem atualizada para os clientes.', error: false })
    } catch (error) {
      console.error('Erro ao atualizar imagem pública:', error)
      setMessage({ text: 'Não foi possível atualizar a imagem.', error: true })
    } finally {
      setBusy(null)
    }
  }

  async function remove(kind: PhotoKind) {
    const oldPath = kind === 'perfil' ? paths.profilePath : paths.coverPath
    if (!oldPath) return
    setBusy(kind)
    setMessage(null)
    const field = kind === 'perfil' ? 'foto_perfil_path' : 'foto_capa_path'
    const { error } = await supabase.from('profiles').update({ [field]: null }).eq('id', userId)
    if (error) {
      setBusy(null)
      setMessage({ text: 'Não foi possível remover a imagem.', error: true })
      return
    }
    if (oldPath.startsWith(`${userId}/`)) await supabase.storage.from(SELLER_PHOTO_BUCKET).remove([oldPath])
    const next = kind === 'perfil'
      ? { ...paths, profilePath: null }
      : { ...paths, coverPath: null }
    emit(next)
    setBusy(null)
    setMessage({ text: 'Imagem removida.', error: false })
  }

  const entries: Array<{ kind: PhotoKind; label: string; path: string | null; ratio: string }> = [
    { kind: 'perfil', label: 'Foto do perfil', path: paths.profilePath, ratio: '1 / 1' },
    { kind: 'capa', label: 'Capa da vitrine', path: paths.coverPath, ratio: '16 / 9' },
  ]

  return (
    <section className="surface" style={{ marginBottom: 14, padding: 15, boxShadow: 'none' }}>
      <input ref={inputRef} type="file" accept={ACCEPT} onChange={upload} style={{ display: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Camera size={18} color={accent} />
        <div style={{ color: '#132238', fontSize: 14, fontWeight: 900 }}>Fotos públicas</div>
      </div>
      {/* `maxWidth` no bloco todo: as caixas usam proporção fixa (1/1 e 16/9),
          e sem teto de largura elas crescem junto com a tela — num monitor
          grande a coluna passava de 600px e a foto do perfil virava um quadrado
          de 600×600, ocupando meia página. Foto de perfil não precisa ser
          maior que isso pra ser conferida. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.45fr)', gap: 10, maxWidth: 460 }}>
        {entries.map(entry => {
          const url = entry.path ? supabase.storage.from(SELLER_PHOTO_BUCKET).getPublicUrl(entry.path).data.publicUrl : null
          return (
            <div key={entry.kind}>
              <div style={{ marginBottom: 6, color: '#617089', fontSize: 10.5, fontWeight: 800 }}>{entry.label}</div>
              <button type="button" onClick={() => choose(entry.kind)} disabled={busy !== null} aria-label={`Alterar ${entry.label.toLowerCase()}`} style={{ width: '100%', aspectRatio: entry.ratio, display: 'grid', placeItems: 'center', overflow: 'hidden', padding: 0, border: '1px dashed #b9c8d6', borderRadius: 8, background: '#f7fafc', color: accent, cursor: busy ? 'wait' : 'pointer' }}>
                {busy === entry.kind
                  ? <Loader2 size={22} className="animate-spin-slow" />
                  : url
                    ? <img src={url} alt={entry.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <ImagePlus size={24} />}
              </button>
              {entry.path && (
                <button type="button" title={`Remover ${entry.label.toLowerCase()}`} aria-label={`Remover ${entry.label.toLowerCase()}`} onClick={() => void remove(entry.kind)} disabled={busy !== null} style={{ width: '100%', minHeight: 34, marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: 0, background: 'transparent', color: '#b42335', fontSize: 11, fontWeight: 800, cursor: busy ? 'wait' : 'pointer' }}>
                  <Trash2 size={14} /> Remover
                </button>
              )}
            </div>
          )
        })}
      </div>
      {message && <div style={{ marginTop: 9, color: message.error ? '#b42335' : '#148447', fontSize: 11, fontWeight: 750 }}>{message.text}</div>}
    </section>
  )
}
