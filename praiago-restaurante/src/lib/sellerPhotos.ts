import { supabase } from './supabase'

export const SELLER_PHOTO_BUCKET = 'perfis-vendedores'

export function sellerPhotoUrl(path?: string | null) {
  if (!path) return null
  return supabase.storage.from(SELLER_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl
}
