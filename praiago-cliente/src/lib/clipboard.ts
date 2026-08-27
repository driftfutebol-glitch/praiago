/**
 * Copia texto e diz se conseguiu.
 *
 * Estava escondido dentro do PedirPage, usado so pelo copia-e-cola do PIX. O
 * painel de cupons precisa do mesmo, e duplicar um fallback de clipboard e o
 * tipo de coisa que envelhece diferente nos dois lugares.
 *
 * O fallback do `textarea` existe porque `navigator.clipboard` exige contexto
 * seguro e, em WebView, as vezes esta la mas recusa sem gesto do usuario.
 * Devolver `false` importa: quem chama mostra "Copiado" so quando copiou de
 * verdade.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch { /* tenta o fallback abaixo */ }

  try {
    const el = document.createElement('textarea')
    el.value = texto
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}
