// Executado no head, antes do CSS/React, para evitar o flash claro no tema escuro.
try {
  var ambulanteTheme = JSON.parse(localStorage.getItem('praiago-ambulante-theme') || 'null');
  var ambulanteDark = ambulanteTheme && ambulanteTheme.version === 1 && ambulanteTheme.state && ambulanteTheme.state.darkMode === true;
  document.documentElement.dataset.theme = ambulanteDark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = ambulanteDark ? 'dark' : 'light';
} catch {
  document.documentElement.dataset.theme = 'light';
}
