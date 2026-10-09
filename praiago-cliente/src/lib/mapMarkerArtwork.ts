// Os pinos do Leaflet recebem HTML estático. Não precisam carregar o renderizador
// de servidor do React no celular só para desenhar três pequenos pictogramas.
const icon = (shapes: string) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`
export const customerMarkup = icon('<circle cx="12" cy="7.5" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>')
export const cartMarkup = icon('<path d="M2 3h3l3 12h11l3-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>')
export const storeMarkup = icon('<path d="M3 9l2-6h14l2 6M3 9v2a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V9M5 14v7h14v-7M10 21v-6h4v6"/>')
