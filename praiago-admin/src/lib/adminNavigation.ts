export type AdminProfile = { id: string; nome: string | null; email: string | null; role: string; permissions: string[] | null }
export type QueueKey = 'tickets' | 'kyc' | 'verificacoes' | 'localizacoes' | 'nomes' | 'novos' | 'testers'
export type AdminDestination = { to: string; label: string; description: string; section: string; group: string; icon: string; ownerOnly?: boolean; badge?: QueueKey }

export const adminDestinations: AdminDestination[] = [
  { to:'/',label:'Início',description:'Resumo da operação e próximas ações',section:'dashboard',group:'Visão geral',icon:'home' },
  { to:'/pedidos',label:'Pedidos',description:'Acompanhar entregas e exceções administrativas',section:'pedidos',group:'Operação',icon:'orders' },
  { to:'/financeiro',label:'Financeiro',description:'Pagamentos, repasses, saques e reembolsos',section:'financeiro',group:'Operação',icon:'wallet' },
  { to:'/troca-conta',label:'Troca de conta',description:'Analisar alterações bancárias dos vendedores',section:'financeiro',group:'Operação',icon:'bank' },
  { to:'/usuarios',label:'Usuários',description:'Clientes, restaurantes, ambulantes e contas',section:'usuarios',group:'Pessoas e cadastros',icon:'users' },
  { to:'/novos-usuarios',label:'Novos cadastros',description:'Cadastros recentes, sem contar testadores',section:'usuarios',group:'Pessoas e cadastros',icon:'newUser',badge:'novos' },
  { to:'/testers',label:'Testadores',description:'Contas de revisão e testes',section:'usuarios',group:'Pessoas e cadastros',icon:'test',badge:'testers' },
  { to:'/verificacoes',label:'Verificações',description:'Documentos e validação de identidade',section:'verificacoes',group:'Pessoas e cadastros',icon:'verified',badge:'verificacoes' },
  { to:'/localizacoes',label:'Localizações',description:'Solicitações de correção de ponto fixo',section:'usuarios',group:'Pessoas e cadastros',icon:'location',badge:'localizacoes' },
  { to:'/troca-nome',label:'Nome da loja',description:'Revisar solicitações de troca de nome',section:'usuarios',group:'Pessoas e cadastros',icon:'signature',badge:'nomes' },
  { to:'/exclusoes',label:'Exclusões de conta',description:'Acompanhar solicitações de exclusão',section:'usuarios',group:'Pessoas e cadastros',icon:'trash' },
  { to:'/cadastros-evento',label:'Cadastros do evento',description:'Relatório de cadastro assistido',section:'usuarios',group:'Pessoas e cadastros',icon:'eventUsers' },
  { to:'/atendimento/todas',label:'Atendimento',description:'Todos os chamados e suporte',section:'atendimento',group:'Atendimento',icon:'support',badge:'tickets' },
  { to:'/liberacao-saque',label:'Liberação de saque',description:'Chamados de verificação para saques',section:'atendimento',group:'Atendimento',icon:'shield',badge:'kyc' },
  ...(['iphone','android','restaurante','ambulante','cliente'] as const).map(platform=>({to:`/atendimento/${platform}`,label:({iphone:'iPhone',android:'Android',restaurante:'Restaurante',ambulante:'Ambulante',cliente:'Cliente'})[platform],description:`Suporte do ${platform}`,section:'atendimento',group:'Canais de suporte',icon:'support'})),
  { to:'/eventos',label:'Eventos',description:'Gerenciar eventos da plataforma',section:'eventos',group:'Conteúdo e crescimento',icon:'calendar' },
  { to:'/cupons',label:'Cupons',description:'Criar e acompanhar descontos',section:'cupons',group:'Conteúdo e crescimento',icon:'coupon' },
  { to:'/promocoes',label:'Campanhas',description:'Promoções e notificações promocionais',section:'promocoes',group:'Conteúdo e crescimento',icon:'campaign' },
  { to:'/erros',label:'Segurança e logs',description:'Auditoria, acessos e controles de IP',section:'erros',group:'Sistema',icon:'security' },
  { to:'/atualizacoes',label:'Atualizações dos apps',description:'Conferir lojas e aprovar avisos de versão',section:'atualizacoes',group:'Sistema',icon:'phone',ownerOnly:true },
  { to:'/admins',label:'Administradores',description:'Equipe e permissões de acesso',section:'admins',group:'Sistema',icon:'admin',ownerOnly:true },
]

export function canAccessAdmin(profile: AdminProfile, section: string, ownerOnly=false) {
  if(profile.role==='sysadmin') return true
  if(profile.role!=='admin' || ownerOnly) return false
  return profile.permissions===null || profile.permissions.includes(section)
}
export function allowedDestinations(profile: AdminProfile) {
  return adminDestinations.filter(item=>canAccessAdmin(profile,item.section,!!item.ownerOnly))
}
export function currentDestination(pathname: string) {
  return adminDestinations.find(item=>item.to===pathname) || adminDestinations.find(item=>item.to!=='/' && pathname.startsWith(`${item.to}/`))
}
export function searchDestinations(items: AdminDestination[], term: string) {
  const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  const words=normalize(term.trim()).split(/\s+/).filter(Boolean)
  return items.filter(item=>words.every(word=>normalize(`${item.label} ${item.description} ${item.group}`).includes(word)))
}
