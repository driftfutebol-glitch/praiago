// Executado antes da primeira pintura. Externo para respeitar script-src 'self'.
;(() => {
  let dark = false
  try {
    const saved = JSON.parse(localStorage.getItem('praiago-cliente-preferences') || 'null')
    dark = saved?.version === 1 && saved?.state?.darkMode === true
  } catch { /* Primeiro acesso ou armazenamento indisponível: tema claro. */ }
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  document.documentElement.style.backgroundColor = dark ? '#081e25' : '#f7f8f4'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#081e25' : '#f7f8f4')
})()
