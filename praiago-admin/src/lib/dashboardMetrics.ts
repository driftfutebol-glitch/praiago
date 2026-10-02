export type DashboardOrder = {id:string;created_at:string;status:string;total:number|string|null;cliente_nome?:string|null;zona?:string|null}
const dateKey = (date:Date) => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)
export function dashboardWindow(now=new Date()) {
  const days=Array.from({length:7},(_,i)=>dateKey(new Date(now.getTime()-(6-i)*86400000)))
  return {days,start:days[0]+'T00:00:00-03:00'}
}
export function dashboardMetrics(orders:DashboardOrder[],now=new Date()) {
  const {days}=dashboardWindow(now)
  const daily=days.map(key=>({key,label:key.slice(8)+'/'+key.slice(5,7),count:0}))
  let deliveredCents=0,missingTotals=0
  for(const order of orders) {
    const date=new Date(order.created_at)
    if(!Number.isFinite(date.getTime())) continue
    const day=daily.find(item=>item.key===dateKey(date))
    if(!day) continue
    day.count++
    const total=Number(order.total)
    if(order.status==='entregue') {
      if(order.total===null||String(order.total).trim()===''||!Number.isFinite(total)||total<0) missingTotals++
      else deliveredCents+=Math.round(total*100)
    }
  }
  return {daily,deliveredCents,missingTotals,maximum:Math.max(1,...daily.map(item=>item.count))}
}
export const formatMoney = (value:number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value)
