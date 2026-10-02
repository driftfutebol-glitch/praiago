import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { allowedDestinations, canAccessAdmin, type AdminProfile, type AdminDestination, type QueueKey } from '../lib/adminNavigation'

export type QueueCounts = Record<QueueKey, number | null>
export type WorkspaceState = { profile: AdminProfile; destinations: AdminDestination[]; counts: QueueCounts; updatedAt: Date | null; error: boolean; loading: boolean; refresh: () => Promise<void> }
const emptyCounts: QueueCounts = {tickets:null,kyc:null,verificacoes:null,localizacoes:null,nomes:null,novos:null,testers:null}
export const AdminWorkspaceContext = createContext<WorkspaceState | null>(null)
export function useAdminWorkspace() {
  const state=useContext(AdminWorkspaceContext)
  if(!state) throw new Error('AdminWorkspace não foi inicializado.')
  return state
}
export function useQueueCounts(profile: AdminProfile) {
  const [counts,setCounts]=useState<QueueCounts>(emptyCounts)
  const [updatedAt,setUpdatedAt]=useState<Date|null>(null)
  const [error,setError]=useState(false)
  const [loading,setLoading]=useState(true)
  const inFlight=useRef(false),generation=useRef(0)
  const refresh=useCallback(async()=>{
    if(inFlight.current) return
    inFlight.current=true
    setLoading(true)
    const token=generation.current
    const next: QueueCounts={...emptyCounts}
    let failed=false
    const jobs: Promise<void>[]=[]
    async function count(key: QueueKey,query: PromiseLike<{count:number|null;error:unknown}>) {
      try { const result=await query; if(result.error || result.count===null) failed=true; else next[key]=result.count }
      catch { failed=true }
    }
    if(canAccessAdmin(profile,'atendimento')) {
      jobs.push(count('tickets',supabase.from('tickets').select('id',{head:true,count:'exact'}).in('status',['aberto','em_andamento'])))
      jobs.push(count('kyc',supabase.from('tickets').select('id',{head:true,count:'exact'}).eq('origem','kyc').in('status',['aberto','em_andamento'])))
    }
    if(canAccessAdmin(profile,'verificacoes')) jobs.push(count('verificacoes',supabase.from('verificacoes').select('id',{head:true,count:'exact'}).eq('status','pendente')))
    if(canAccessAdmin(profile,'usuarios')) {
      jobs.push(count('localizacoes',supabase.from('solicitacoes_correcao_localizacao').select('id',{head:true,count:'exact'}).eq('status','pendente')))
      jobs.push(count('nomes',supabase.from('solicitacoes_troca_nome').select('id',{head:true,count:'exact'}).eq('status','pendente')))
      jobs.push(count('novos',supabase.from('profiles').select('id',{head:true,count:'exact'}).gte('created_at',new Date(Date.now()-7*86400000).toISOString()).neq('role','sysadmin').or('conta_demo.is.null,conta_demo.eq.false')))
      jobs.push(count('testers',supabase.from('profiles').select('id',{head:true,count:'exact'}).eq('conta_demo',true)))
    }
    await Promise.all(jobs)
    if(token===generation.current) { setCounts(next);setError(failed);setLoading(false);setUpdatedAt(failed?null:new Date()) }
    if(token===generation.current) inFlight.current=false
  },[profile])
  useEffect(()=>{
    // Polling remains necessary for tables not published to Realtime. One shared subscription.
    const epoch=generation.current+1;generation.current=epoch; inFlight.current=false
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule=()=>{ if(document.visibilityState==='hidden') return; clearTimeout(timer);timer=setTimeout(()=>void refresh(),500) }
    const tables:string[]=[]
    if(canAccessAdmin(profile,'atendimento')) tables.push('tickets')
    if(canAccessAdmin(profile,'verificacoes')) tables.push('verificacoes')
    if(canAccessAdmin(profile,'usuarios')) tables.push('profiles','solicitacoes_correcao_localizacao','solicitacoes_troca_nome')
    const channel=supabase.channel(`admin_workspace_${profile.id}`)
    for(const table of tables) channel.on('postgres_changes',{event:'*',schema:'public',table},schedule)
    if(tables.length) channel.subscribe()
    const interval=window.setInterval(schedule,45000)
    const visible=()=>{if(document.visibilityState==='visible')void refresh()}
    document.addEventListener('visibilitychange',visible);window.addEventListener('online',visible)
    void refresh()
    return ()=>{generation.current=epoch+1;clearTimeout(timer);window.clearInterval(interval);document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',visible);void supabase.removeChannel(channel)}
  },[profile,refresh])
  return {profile,destinations:allowedDestinations(profile),counts,updatedAt,error,loading,refresh}
}
