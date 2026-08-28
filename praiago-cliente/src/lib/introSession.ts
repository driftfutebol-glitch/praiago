const CHAVE_SESSAO = 'praiago_intro_vista'

export function deveMostrarIntro() {
  try {
    if (sessionStorage.getItem(CHAVE_SESSAO)) return false
    sessionStorage.setItem(CHAVE_SESSAO, '1')
    return true
  } catch {
    return false
  }
}
