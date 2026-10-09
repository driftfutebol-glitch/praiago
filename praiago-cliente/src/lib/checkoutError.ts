type CheckoutFailure = { message?: string; code?: string }
export function mensagemErroPedido(error?: CheckoutFailure | null): string {
  const texto = String(error?.message || '')
  if (/cupom ja usado|cupom_usos/i.test(texto)) {
    return 'Este cupom já está reservado em outro pedido pendente. Cancele esse pedido em Meus Pedidos ou conclua o pagamento.'
  }
  // Return only known validations, never raw SQL/internal messages.
  if (error?.code === '23514' && /esgotou|restam s[oó]|estoque/i.test(texto)) return texto
  if (/sabores invalidos|quantidade invalida|produto invalido|pedido sem itens|pedido sem valor/i.test(texto)) {
    return 'Um item ou sabor do carrinho mudou ou ficou indisponível. Atualize o carrinho e tente de novo.'
  }
  if (error?.code === '42501') {
    return 'Não foi possível validar sua conta para criar o pedido. Atualize a tela e tente novamente; se continuar, entre novamente ou fale com o suporte (código 42501).'
  }
  if (['PGRST301', 'PGRST302', 'PGRST303'].includes(error?.code || '')) {
    return 'Sua sessão precisa ser renovada. Entre novamente antes de finalizar o pedido.'
  }
  if (error?.code === '23514' && /cupom/i.test(texto)) return texto
  if (/failed to fetch|network|fetch failed/i.test(texto)) {
    return 'A conexão falhou ao enviar o pedido. Confira Meus Pedidos antes de tentar novamente para evitar duplicidade.'
  }
  const code = /^[A-Z0-9]{5,10}$/.test(error?.code || '') ? ` (código ${error?.code})` : ''
  return `Não foi possível criar o pedido agora${code}. Confira Meus Pedidos antes de tentar novamente.`
}
