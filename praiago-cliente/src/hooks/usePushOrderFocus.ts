import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

export function usePushOrderFocus(orderIds: string[], resetFilter:()=>void){
 const [params]=useSearchParams()
 const requested=params.get('pedido')
 const target=requested&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requested)?requested:null
 const focused=useRef<string|null>(null)
 useEffect(()=>{if(target){focused.current=null;resetFilter()}},[target]) // filter reset only when a new push is opened
 const ids=orderIds.join(',')
 useEffect(()=>{
  if(!target||focused.current===target||!orderIds.includes(target))return
  const node=document.getElementById('push-order-'+target)
  if(!node)return
  const timer=window.setTimeout(()=>{
   node.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})
   node.focus({preventScroll:true});focused.current=target
  },200)
  return()=>window.clearTimeout(timer)
 },[target,ids])
 return target
}
