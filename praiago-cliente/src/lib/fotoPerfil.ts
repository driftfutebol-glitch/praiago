import { supabase } from './supabase'

// Bucket público compartilhado: apesar do nome falar "vendedores", é o mesmo
// bucket onde o cliente guarda a foto de perfil. A política de storage libera a
// role `cliente`, mas EXIGE que o caminho comece com a pasta do próprio usuário
// (`${userId}/...`) — é isso que impede um usuário de escrever na pasta do
// outro. Qualquer caminho montado fora desse formato volta como erro de RLS.
export const BUCKET_FOTOS = 'perfis-vendedores'

/** Tamanho máximo aceito. Acima disso o upload trava a conexão do celular. */
export const LIMITE_FOTO_BYTES = 5 * 1024 * 1024

// Aceita o que celular de verdade produz. O HEIC/HEIF é o formato PADRÃO da
// câmera do iPhone — sem ele na lista, quem chega de iPhone simplesmente não
// consegue subir a foto. O iOS costuma converter pra JPEG no seletor de
// arquivos, mas nem sempre, e quando não converte o upload morria.
export const TIPOS_FOTO_ACEITOS = [
  'image/jpeg', 'image/jpg', 'image/pjpeg',
  'image/png', 'image/webp', 'image/gif', 'image/avif',
  'image/heic', 'image/heif',
]

/** Vai no atributo `accept` do input: define o que o seletor do celular mostra. */
export const ACCEPT_FOTO = TIPOS_FOTO_ACEITOS.join(',') + ',image/*'

/** URL pública da foto. Devolve null quando o perfil ainda não tem foto. */
export function urlFotoPerfil(path?: string | null) {
  if (!path) return null
  return supabase.storage.from(BUCKET_FOTOS).getPublicUrl(path).data.publicUrl
}

/** Extensão do arquivo pro nome do objeto no storage. */
export function extensaoDaFoto(file: File) {
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
  if (doNome && /^(png|webp|gif|avif|heic|heif|jpe?g)$/.test(doNome)) {
    return doNome === 'jpeg' ? 'jpg' : doNome
  }
  return 'jpg'
}

/**
 * Valida o arquivo escolhido. Devolve a mensagem de erro pro usuário, ou null
 * quando está tudo certo.
 */
export function validarFoto(file: File): string | null {
  // `file.type` vem VAZIO em WebView antigo e em alguns gerenciadores de
  // arquivo. Recusar nesse caso barrava foto legítima, então quando não há tipo
  // a gente deixa passar e confia na validação do bucket.
  if (file.type && !TIPOS_FOTO_ACEITOS.includes(file.type.toLowerCase())) {
    return 'Esse arquivo não é uma imagem. Escolha uma foto.'
  }
  if (file.size > LIMITE_FOTO_BYTES) {
    return 'A imagem deve ter no máximo 5 MB.'
  }
  return null
}

/**
 * Monta o caminho do objeto dentro do bucket. Sempre sob `${userId}/` (a policy
 * exige) e sempre com nome novo — assim a URL pública muda a cada troca e o
 * cache do navegador/WebView não devolve a foto antiga.
 */
export function caminhoFotoPerfil(userId: string, file: File) {
  const unico = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `${userId}/perfil-${unico}.${extensaoDaFoto(file)}`
}
