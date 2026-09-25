// Consulta acionada pelo usuário durante o cadastro. Não expõe um proxy
// genérico: parâmetros, tamanho da busca e destino são fixos.
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET') return Response.json({ error: 'Método não permitido.' }, { status: 405 })

    const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''
    if (q.length < 6 || q.length > 180) return Response.json({ error: 'Endereço inválido.' }, { status: 400 })

    const upstream = new URL('https://nominatim.openstreetmap.org/search')
    upstream.searchParams.set('q', q)
    upstream.searchParams.set('format', 'jsonv2')
    upstream.searchParams.set('addressdetails', '1')
    upstream.searchParams.set('limit', '5')
    upstream.searchParams.set('countrycodes', 'br')

    try {
      const response = await fetch(upstream, {
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'pt-BR',
          'User-Agent': 'PraiaGo-Restaurante/1.0 (+https://www.praiago.com.br)',
        },
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) return Response.json({ error: 'Busca indisponível.' }, { status: 503 })
      const data: unknown = await response.json()
      if (!Array.isArray(data)) return Response.json({ error: 'Resposta inválida.' }, { status: 502 })
      return Response.json(data, {
        headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' },
      })
    } catch {
      return Response.json({ error: 'Busca indisponível.' }, { status: 503 })
    }
  },
}
