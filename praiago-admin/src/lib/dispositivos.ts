// Como o painel fala de aparelho e de app.
//
// A fonte é `signup_ips.plataforma`, gravada pela edge function 'cadastro'. Ela
// pode ser nula, e de propósito: cadastro feito antes de 05/09/2026, ou por um
// app que ainda não recebeu a atualização, não tem essa informação. Nesse caso
// a tela diz "não registrado" — chutar iPhone porque o user-agent parece um
// seria pior que admitir que não se sabe.

export type Plataforma = 'ios' | 'android' | 'web' | 'desconhecida'

export const PLATAFORMAS: { chave: Plataforma; rotulo: string; cor: string }[] = [
  { chave: 'ios', rotulo: 'iPhone / iPad', cor: 'text-sky-300 bg-sky-500/10 border-sky-500/20' },
  { chave: 'android', rotulo: 'Android', cor: 'text-green-300 bg-green-500/10 border-green-500/20' },
  { chave: 'web', rotulo: 'Navegador', cor: 'text-amber-300 bg-amber-500/10 border-amber-500/20' },
  { chave: 'desconhecida', rotulo: 'Não registrado', cor: 'text-slate-400 bg-slate-500/10 border-slate-600/20' },
]

export function normalizarPlataforma(valor: unknown): Plataforma {
  const v = String(valor || '').toLowerCase()
  if (v === 'ios' || v === 'android' || v === 'web') return v
  return 'desconhecida'
}

export function rotuloPlataforma(p: Plataforma) {
  return PLATAFORMAS.find(x => x.chave === p)?.rotulo || 'Não registrado'
}

export function corPlataforma(p: Plataforma) {
  return PLATAFORMAS.find(x => x.chave === p)?.cor || PLATAFORMAS[3].cor
}

export const APPS: { chave: string; rotulo: string; cor: string }[] = [
  { chave: 'cliente', rotulo: 'Cliente', cor: 'text-blue-300 bg-blue-500/10 border-blue-500/20' },
  { chave: 'ambulante', rotulo: 'Ambulante', cor: 'text-green-300 bg-green-500/10 border-green-500/20' },
  { chave: 'restaurante', rotulo: 'Restaurante', cor: 'text-orange-300 bg-orange-500/10 border-orange-500/20' },
  { chave: 'entregador', rotulo: 'Entregador', cor: 'text-purple-300 bg-purple-500/10 border-purple-500/20' },
]

export function corApp(app: string | null) {
  return APPS.find(x => x.chave === app)?.cor || 'text-slate-400 bg-slate-500/10 border-slate-600/20'
}

export function rotuloApp(app: string | null) {
  return APPS.find(x => x.chave === app)?.rotulo || '—'
}

// Tipos de conta de teste. `conta_demo` continua sendo o interruptor que
// esconde a conta do radar, das listagens e do mapa — quem faz esse corte é o
// gatilho sync_vendedor_publico, no banco. O `tester_tipo` só explica POR QUE
// aquela conta existe, que era o que faltava para a lista fazer sentido.
export const TIPOS_TESTER: { chave: string; rotulo: string; descricao: string; cor: string }[] = [
  {
    chave: 'revisao',
    rotulo: 'Revisão das lojas',
    descricao: 'Conta que a Apple e o Google usam para revisar o app. Não apagar.',
    cor: 'text-violet-300 bg-violet-500/10 border-violet-500/25',
  },
  {
    chave: 'interno',
    rotulo: 'Teste interno',
    descricao: 'Conta da equipe, usada para conferir o app em produção.',
    cor: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/25',
  },
  {
    chave: 'beta',
    rotulo: 'Testador convidado',
    descricao: 'Pessoa de fora convidada para testar antes do lançamento.',
    cor: 'text-amber-300 bg-amber-500/10 border-amber-500/25',
  },
]

export function tipoTester(chave: string | null) {
  return TIPOS_TESTER.find(t => t.chave === chave) || TIPOS_TESTER[0]
}
