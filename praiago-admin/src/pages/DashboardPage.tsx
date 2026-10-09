import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Activity, ShoppingBag, Users, WalletCards, ShieldCheck, RefreshCw, ArrowUpRight, ChevronRight, Sparkles, BarChart3 } from 'lucide-react'
import { useAdminWorkspace } from '../components/AdminWorkspace'
import { navigationIcons } from '../lib/navigationIcons'
import { canAccessAdmin } from '../lib/adminNavigation'
import { dashboardMetrics, dashboardWindow, formatMoney, type DashboardOrder } from '../lib/dashboardMetrics'

type Summary={orders:number|null;active:number|null;users:number|null;recent:DashboardOrder[];periodCount:number|null;error:boolean;loadedAt:Date|null}
const empty:Summary={orders:null,active:null,users:null,recent:[],periodCount:null,error:false,loadedAt:null}
export default function DashboardPage() {
  const {profile,destinations,counts,error:queueError,refresh:refreshQueues}=useAdminWorkspace()
  const [summary,setSummary]=useState<Summary>(empty),[loading,setLoading]=useState(true)
  const generation=useRef(0),inFlight=useRef(false)
  const ordersAllowed=canAccessAdmin(profile,'pedidos'),financeAllowed=canAccessAdmin(profile,'financeiro'),usersAllowed=canAccessAdmin(profile,'usuarios')
  const load=useCallback(async()=>{
    if(inFlight.current)return
    inFlight.current=true
    const token=generation.current
    setLoading(true)
    const next:Summary={...empty}
    const tasks:Promise<void>[]=[]
    async function run(query:PromiseLike<{error:unknown;count?:number|null;data?:unknown}>,apply:(result:{count?:number|null;data?:unknown})=>void) {
      try {const result=await query;if(result.error)next.error=true;else apply(result)}catch{next.error=true}
    }
    if(ordersAllowed) {
      tasks.push(run(supabase.from('pedidos').select('id',{head:true,count:'exact'}),r=>{next.orders=r.count??null}))
      tasks.push(run(supabase.from('pedidos').select('id',{head:true,count:'exact'}).not('status','in','(entregue,cancelado)'),r=>{next.active=r.count??null}))
    }
    if(ordersAllowed||financeAllowed) tasks.push(run(supabase.from('pedidos').select('id,created_at,status,total,cliente_nome,zona',{count:'exact'}).gte('created_at',dashboardWindow().start).order('created_at',{ascending:false}).limit(500),r=>{next.recent=(r.data||[]) as DashboardOrder[];next.periodCount=r.count??null}))
    if(usersAllowed) tasks.push(run(supabase.from('profiles').select('id',{head:true,count:'exact'}),r=>{next.users=r.count??null}))
    await Promise.all(tasks)
    if(token===generation.current){next.loadedAt=new Date();setSummary(next);setLoading(false);inFlight.current=false}
  },[ordersAllowed,financeAllowed,usersAllowed])
  useEffect(()=>{
    const epoch=generation.current+1;generation.current=epoch;inFlight.current=false
    let timer:ReturnType<typeof setTimeout>|undefined
    const schedule=()=>{if(document.visibilityState==='hidden')return;clearTimeout(timer);timer=setTimeout(()=>void load(),700)}
    const channel=supabase.channel('admin_home_summary')
    if(ordersAllowed||financeAllowed) channel.on('postgres_changes',{event:'*',schema:'public',table:'pedidos'},schedule)
    if(usersAllowed)channel.on('postgres_changes',{event:'*',schema:'public',table:'profiles'},schedule)
    if(ordersAllowed||financeAllowed||usersAllowed)channel.subscribe()
    const interval=window.setInterval(schedule,60000)
    const onVisible=()=>{if(document.visibilityState==='visible')void load()}
    document.addEventListener('visibilitychange',onVisible);window.addEventListener('online',onVisible)
    void load()
    return()=>{generation.current++;clearTimeout(timer);window.clearInterval(interval);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('online',onVisible);void supabase.removeChannel(channel)}
  },[load,ordersAllowed,financeAllowed,usersAllowed])
  const metrics=dashboardMetrics(summary.recent,summary.loadedAt||new Date())
  const limited=summary.periodCount!==null&&summary.periodCount>summary.recent.length
  const moneyReady=summary.periodCount!==null&&metrics.missingTotals===0
  const stats=[
    ...(ordersAllowed?[{label:'Pedidos ativos',value:summary.active,description:'Aguardando conclusão',icon:Activity,color:'#bb87ff',to:'/pedidos'},{label:'Pedidos registrados',value:summary.orders,description:'Contagem total na base',icon:ShoppingBag,color:'#68bcff',to:'/pedidos'}]:[]),
    ...(financeAllowed?[{label:limited?'Volume entregue · amostra':'Volume entregue · 7 dias',value:moneyReady?formatMoney(metrics.deliveredCents/100):null,description:limited?'Últimos 500 pedidos do período':'Total dos pedidos entregues, não saldo',icon:WalletCards,color:'#7be2b0',to:'/financeiro'}]:[]),
    ...(usersAllowed?[{label:'Usuários cadastrados',value:summary.users,description:'Contagem total de perfis',icon:Users,color:'#f5c266',to:'/usuarios'}]:[])
  ]
  const queues=destinations.filter(item=>['tickets','verificacoes','localizacoes','nomes'].includes(item.badge||''))
  const shortcuts=destinations.filter(item=>['/pedidos','/usuarios','/financeiro','/atendimento/todas','/erros','/atualizacoes'].includes(item.to))
  return <div className="space-y-6">
    <header className="admin-hero">
      <div><div className="admin-hero-eyebrow"><Sparkles size={14}/>Sua operação, em perspectiva</div><h1>Olá, {(profile.nome||'administrador').split(' ')[0]}.<br/>Vamos cuidar da PraiaGo?</h1><p>Acompanhe os pedidos, encontre o que precisa de atenção e acesse as ferramentas certas sem perder tempo.</p></div>
      <div className="admin-hero-aside"><time>{new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}</time><button className="admin-secondary-button" disabled={loading} onClick={()=>{void load();void refreshQueues()}}><RefreshCw size={15}/>Atualizar visão</button><small>{loading?'Consultando dados…':summary.loadedAt?'Consultado às '+summary.loadedAt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'Aguardando consulta'}</small></div>
    </header>
    {summary.error&&<p role="alert" className="admin-inline-warning">Alguns dados não puderam ser consultados. Os campos indisponíveis aparecem como “—”, não como zero. Tente atualizar.</p>}
    {financeAllowed&&metrics.missingTotals>0&&<p role="alert" className="admin-inline-warning">O volume entregue está indisponível: {metrics.missingTotals} pedido(s) entregue(s) no período carregado não têm um total válido. Confira os registros no Financeiro.</p>}
    {stats.length>0&&<div className="admin-metrics">{stats.map(stat=><Link key={stat.label} to={stat.to} className="admin-metric" style={{'--metric-color':stat.color} as CSSProperties}><div className="admin-metric-heading"><span className="admin-metric-icon"><stat.icon size={20}/></span>{stat.label}</div><strong className="admin-metric-value">{stat.value??'—'}</strong><small>{stat.description}</small></Link>)}</div>}
    <div className="admin-home-columns">
      {(ordersAllowed||financeAllowed)&&<section className="admin-section-card"><div className="admin-section-heading"><div><h2 className="flex items-center gap-2"><BarChart3 size={17} className="text-purple-400"/>Pedidos nos últimos 7 dias</h2><p>Volume diário de pedidos registrados · horário de Brasília</p></div>{ordersAllowed&&<Link to="/pedidos">Ver pedidos<ArrowUpRight size={14}/></Link>}</div>
        {summary.periodCount===null?<p className="admin-empty">{loading?'Consultando atividade…':'Atividade indisponível. Atualize para tentar novamente.'}</p>:<><div className="admin-chart" role="img" aria-label={metrics.daily.map(day=>day.label+': '+day.count+' pedidos').join('; ')}>{metrics.daily.map(day=><div className="admin-chart-column" key={day.key}><b>{day.count}</b><div className="admin-chart-bar" style={{height:Math.max(2,day.count/metrics.maximum*112)+'px'}}/><small>{day.label}</small></div>)}</div><small className="admin-chart-note">{limited?'Amostra: últimos 500 de '+summary.periodCount+' pedidos do período. Os valores por dia não representam a totalidade.':'Todos os '+summary.periodCount+' pedidos do período. Pedidos cancelados também fazem parte do volume de entradas.'}</small></>}
      </section>}
      <section className="admin-section-card"><div className="admin-section-heading"><div><h2 className="flex items-center gap-2"><ShieldCheck size={17} className="text-purple-400"/>Precisa de atenção</h2><p>As filas disponíveis para sua conta</p></div></div>{queueError&&<p className="admin-inline-warning" role="alert">Algumas filas estão indisponíveis. Atualize os contadores.</p>}{queues.map(item=><Link className="admin-pending-row" to={item.to} key={item.to}><span><strong>{item.label}</strong><small>{item.description}</small></span><b>{item.badge?counts[item.badge]??'—':'—'}</b><ChevronRight size={16}/></Link>)}{queues.length===0&&<p className="admin-empty">Não há filas liberadas para esta conta.</p>}<p className="admin-chart-note">Nada é aprovado automaticamente. Abra a fila para analisar cada solicitação.</p></section>
    </div>
    <section className="admin-section-card"><div className="admin-section-heading"><div><h2>Acesso rápido</h2><p>Menos procura, mais clareza para resolver.</p></div></div><div className="admin-shortcuts">{shortcuts.map(item=>{const Icon=navigationIcons[item.icon]||Activity;return <Link to={item.to} className="admin-shortcut" key={item.to}><Icon size={21}/><strong>{item.label}</strong><small>{item.description}</small></Link>})}</div></section>
    {ordersAllowed&&<section className="admin-section-card"><div className="admin-section-heading"><div><h2>Pedidos recentes</h2><p>Últimos 5 pedidos dentro do período de 7 dias</p></div><Link to="/pedidos">Ver todos<ArrowUpRight size={14}/></Link></div>
      {summary.recent.slice(0,5).map(order=><div className="admin-recent-order" key={order.id}><div><code>#{order.id.slice(0,8)}</code><div><strong>{order.cliente_nome||'Cliente'}</strong><small className="block">{order.zona||'Localização não informada'}</small></div></div><div><strong>{financeAllowed&&Number.isFinite(Number(order.total))?formatMoney(Number(order.total)):'Pedido recebido'}</strong><span className="admin-status-pill" data-status={order.status}>{order.status.replaceAll('_',' ')}</span></div></div>)}
      {summary.recent.length===0&&<p className="admin-empty">{loading?'Carregando pedidos…':summary.periodCount===null?'Não foi possível consultar os pedidos.':'Nenhum pedido registrado neste período.'}</p>}
    </section>}
  </div>
}
