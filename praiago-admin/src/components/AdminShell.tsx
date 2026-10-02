import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, Search, Bell, X, Plus, Grid2X2, Home, Package, Users, ChevronRight, ArrowUpRight, RefreshCw, ShieldCheck, LogOut } from 'lucide-react'
import Sidebar, { AdminBrand } from './Sidebar'
import { navigationIcons } from '../lib/navigationIcons'
import { AdminWorkspaceContext, useQueueCounts } from './AdminWorkspace'
import { currentDestination, searchDestinations, type AdminProfile } from '../lib/adminNavigation'

type Panel='menu'|'search'|'alerts'|'quick'|'account'|null
export default function AdminShell({profile,onLogout,children}:{profile:AdminProfile;onLogout:()=>void;children:ReactNode}) {
  const workspace=useQueueCounts(profile)
  const {destinations,counts,error,loading,refresh}=workspace
  const location=useLocation()
  const [panel,setPanel]=useState<Panel>(null),[term,setTerm]=useState('')
  const dialogRef=useRef<HTMLDialogElement>(null),searchRef=useRef<HTMLInputElement>(null),mainRef=useRef<HTMLElement>(null)
  const page=currentDestination(location.pathname)
  const pending=destinations.filter(item=>['tickets','verificacoes','localizacoes','nomes'].includes(item.badge||''))
  const pendingCount=pending.reduce((sum,item)=>sum+(item.badge?counts[item.badge]||0:0),0)
  const quick=destinations.filter(item=>['/cupons','/eventos','/promocoes','/atualizacoes','/novos-usuarios','/atendimento/todas'].includes(item.to))
  const mobileItems=[{to:'/',label:'Início',icon:Home},{to:'/pedidos',label:'Pedidos',icon:Package},{to:'/usuarios',label:'Usuários',icon:Users}]
    .filter(item=>destinations.some(destination=>destination.to===item.to))
  const matches=searchDestinations(destinations,term)
  const openPanel=(next:Panel)=>{setTerm('');setPanel(next)}
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setTerm('');setPanel('search')}}
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)
  },[])
  useEffect(()=>{
    const dialog=dialogRef.current
    if(panel && dialog && !dialog.open) dialog.showModal()
    if(!panel && dialog?.open) dialog.close()
    if(panel==='search')searchRef.current?.focus()
  },[panel])
  useEffect(()=>{ mainRef.current?.scrollTo({top:0});setPanel(null) },[location.pathname])
  const panelTitle=panel==='menu'?'Todas as opções':panel==='search'?'Buscar no painel':panel==='alerts'?'Central de pendências':panel==='quick'?'Atalhos rápidos':'Sua sessão'
  function resultLinks(items:typeof destinations) {
    return items.map(item=>{
      const Icon=navigationIcons[item.icon]||Home
      return <Link className="admin-destination" key={item.to} to={item.to} onClick={()=>setPanel(null)}>
        <span className="admin-destination-icon"><Icon size={20} /></span><span><strong>{item.label}</strong><small>{item.description}</small></span><ArrowUpRight size={17} />
      </Link>
    })
  }
  return <AdminWorkspaceContext.Provider value={workspace}>
    <div className="admin-shell">
      <a className="admin-skip-link" href="#admin-content">Ir para o conteúdo</a>
      <div className="admin-desktop-sidebar"><Sidebar onLogout={onLogout} /></div>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <button className="admin-icon-button admin-menu-button" aria-label="Abrir menu completo" aria-haspopup="dialog" onClick={()=>openPanel('menu')}><Menu size={21}/></button>
          <div className="admin-mobile-brand"><AdminBrand compact /></div>
          <div className="admin-breadcrumb"><span>Workspace</span><ChevronRight size={14}/><strong>{page?.label||'Painel'}</strong></div>
          <div className="admin-topbar-actions">
            <button className="admin-search-trigger" onClick={()=>openPanel('search')} aria-label="Buscar opções no painel" aria-haspopup="dialog"><Search size={19}/><span>Buscar uma opção…</span><kbd>Ctrl K</kbd></button>
            <button className="admin-icon-button" onClick={()=>openPanel('alerts')} aria-label={`Central de pendências${!error&&!loading?`: ${pendingCount}`:''}`} aria-haspopup="dialog"><Bell size={20}/>{pendingCount>0&&!error&&<span className="admin-bell-count">{pendingCount>99?'99+':pendingCount}</span>}</button>
            <button className="admin-avatar-button" aria-label="Abrir informações da sessão" aria-haspopup="dialog" onClick={()=>openPanel('account')}>{(profile.nome||profile.email||'A').slice(0,1).toUpperCase()}</button>
          </div>
        </header>
        <main ref={mainRef} id="admin-content" className="admin-content" tabIndex={-1}><div className="admin-page">{children}</div></main>
      </div>
      <nav className="admin-bottom-nav" aria-label="Navegação do celular">
        {mobileItems.slice(0,2).map(item=><NavLink key={item.to} to={item.to} end className={({isActive})=>isActive?'is-active':''}><item.icon size={21}/><span>{item.label}</span></NavLink>)}
        <button className="admin-quick-button" onClick={()=>openPanel('quick')} aria-label="Abrir atalhos rápidos" aria-haspopup="dialog"><span><Plus size={25}/></span><small>Atalhos</small></button>
        {mobileItems.slice(2).map(item=><NavLink key={item.to} to={item.to} className={({isActive})=>isActive?'is-active':''}><item.icon size={21}/><span>{item.label}</span></NavLink>)}
        <button onClick={()=>openPanel('menu')} aria-label="Mais opções" aria-haspopup="dialog"><Grid2X2 size={21}/><span>Mais</span></button>
      </nav>
      <dialog ref={dialogRef} className={`admin-workspace-dialog ${panel==='menu'?'admin-menu-dialog':''}`} aria-labelledby="admin-panel-title"
        onCancel={()=>setPanel(null)} onClose={()=>setPanel(null)} onClick={event=>{if(event.target===dialogRef.current)setPanel(null)}}>
        <div className="admin-dialog-heading"><div><small>PRAIAGO ADMIN</small><h2 id="admin-panel-title">{panelTitle}</h2></div><button className="admin-icon-button" aria-label="Fechar opções" onClick={()=>setPanel(null)}><X size={20}/></button></div>
        {panel==='menu'&&<Sidebar onLogout={()=>{setPanel(null);onLogout()}} onNavigate={()=>setPanel(null)}/>}
        {panel==='search'&&<><label className="admin-command-input"><Search size={21}/><input ref={searchRef} value={term} onChange={event=>setTerm(event.target.value)} placeholder="Pedidos, financeiro, segurança…" aria-label="Buscar opção" /></label><div className="admin-destinations">{resultLinks(matches)}{matches.length===0&&<p className="admin-empty">Nenhuma opção disponível com essa busca.</p>}</div><p className="admin-dialog-footnote">A busca mostra somente as opções permitidas para sua conta.</p></>}
        {panel==='quick'&&<div className="admin-destinations">{resultLinks(quick.length?quick:destinations.slice(0,6))}</div>}
        {panel==='alerts'&&<div className="admin-alert-centre">
          <p>O que precisa de atenção, com acesso direto à fila correspondente.</p>
          <button className="admin-secondary-button" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={16}/>Atualizar contadores</button>
          {error&&<p role="alert" className="admin-inline-warning">Não foi possível conferir todas as filas. Recarregue antes de tomar uma decisão.</p>}
          {pending.map(item=><Link key={item.to} className="admin-pending-row" to={item.to} onClick={()=>setPanel(null)}><span><strong>{item.label}</strong><small>{item.description}</small></span><b>{item.badge&&counts[item.badge]!==null?counts[item.badge]:'—'}</b><ChevronRight size={17}/></Link>)}
          {!loading&&!error&&pendingCount===0&&<p className="admin-empty">Nenhuma pendência nas filas disponíveis para sua conta.</p>}
          <p className="admin-dialog-footnote">Esta central não aprova nem altera registros automaticamente.</p>
        </div>}
        {panel==='account'&&<div className="admin-account-panel"><span className="admin-account-avatar">{(profile.nome||profile.email||'A').slice(0,1).toUpperCase()}</span><h3>{profile.nome||'Administrador'}</h3><p>{profile.email}</p><span className="admin-role-pill"><ShieldCheck size={15}/>{profile.role==='sysadmin'?'Proprietário · nível 5':'Administrador · acesso atribuído'}</span><p className="admin-dialog-footnote">{destinations.length} opções disponíveis. As permissões continuam sendo conferidas pelo painel e pelo servidor.</p><button className="admin-signout" onClick={()=>{setPanel(null);onLogout()}}><LogOut size={17}/>Encerrar sessão</button></div>}
      </dialog>
    </div>
  </AdminWorkspaceContext.Provider>
}
