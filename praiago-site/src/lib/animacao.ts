// ⚠️ REGRA DESTE PROJETO: `useTransform` ligado ao scroll SEMPRE com funcao.
//
// O jeito curto — `useTransform(progresso, [0, 0.75], [1, 0])` — parece certo e
// tem um efeito colateral silencioso: o Framer reconhece o formato "faixa de
// numeros" e compila aquilo pra uma animacao NATIVA de scroll (WAAPI, rodando
// no compositor). Nessa versao o mapeamento sai errado quando a faixa nao cobre
// [0, 1] inteiro. Dois casos medidos aqui:
//   * hero: a opacidade voltava pra ~0,79 no fim da secao em vez de ficar em 0,
//     e o texto reaparecia fantasma por cima da secao do video;
//   * video: a dica "role o mouse" continuava com opacidade ~0,96 no fim.
//
// Passando uma FUNCAO o Framer nao consegue compilar pra WAAPI e mantem a conta
// em JS, que acompanha o scroll corretamente. Esta funcao existe pra que usar o
// caminho certo seja tao curto quanto usar o errado.

/** Mesma interpolacao com clamp nas pontas que o useTransform de faixas faria. */
export function interpolar(v: number, entradas: number[], saidas: number[]) {
  const ultimo = entradas.length - 1
  if (v <= entradas[0]) return saidas[0]
  if (v >= entradas[ultimo]) return saidas[ultimo]
  for (let i = 1; i <= ultimo; i++) {
    if (v <= entradas[i]) {
      const t = (v - entradas[i - 1]) / (entradas[i] - entradas[i - 1])
      return saidas[i - 1] + t * (saidas[i] - saidas[i - 1])
    }
  }
  return saidas[ultimo]
}

/** Atalho: devolve o transformador pronto pra `useTransform(mv, faixa(...))`. */
export function faixa(entradas: number[], saidas: number[]) {
  return (v: number) => interpolar(v, entradas, saidas)
}
