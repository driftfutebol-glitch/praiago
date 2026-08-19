import { createClient } from '@supabase/supabase-js'

// Mesmas chaves PÚBLICAS dos outros apps. Nada de service role aqui: quem tem
// poder de criar conta é a edge function `cadastro-assistido`, que valida no
// servidor se quem chamou é da equipe. Se a chave de serviço viesse pro
// navegador, qualquer um com o link criaria contas à vontade.
const url = import.meta.env.VITE_SUPABASE_URL as string
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
})

export const FUNCTIONS_URL = `${url}/functions/v1`
