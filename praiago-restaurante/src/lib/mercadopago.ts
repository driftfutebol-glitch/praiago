import { supabase } from './supabase'

export type MercadoPagoLinkStatus = {
  provider?: string | null
  status?: string | null
  mercadopago_user_id?: string | null
  mercadopago_linked_at?: string | null
}

export async function buscarStatusMercadoPago(vendedorId: string): Promise<MercadoPagoLinkStatus | null> {
  const { data } = await supabase
    .from('vendor_payment_accounts')
    .select('provider,status,mercadopago_user_id,mercadopago_linked_at')
    .eq('vendedor_id', vendedorId)
    .maybeSingle()

  return data
}

export async function iniciarVinculoMercadoPago(vendedorId: string) {
  const { data, error } = await supabase.functions.invoke<{ authorization_url: string }>('mercadopago-oauth-start', {
    body: {
      vendedor_id: vendedorId,
      return_to: window.location.href,
    },
  })

  if (error) throw new Error(error.message || 'Nao foi possivel iniciar o vinculo Mercado Pago.')
  if (!data?.authorization_url) throw new Error('Mercado Pago nao retornou a URL de autorizacao.')
  window.location.assign(data.authorization_url)
}
