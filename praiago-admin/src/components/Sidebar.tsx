import { NavLink } from 'react-router-dom'
import { LogOut, ShieldCheck, Home } from 'lucide-react'
import { navigationIcons } from '../lib/navigationIcons'
import { useAdminWorkspace } from './AdminWorkspace'



export function AdminBrand({compact=false}:{compact?:boolean}) {
  return <div className={`admin-brand ${compact?'admin-brand-compact':''}`}>
    <span className="admin-brand-mark"><ShieldCheck size={compact?20:24} aria-hidden="true" /></span>
    <div><strong>PRAIAGO <span>ADMIN</span></strong><small>Gestão com visão de praia.</small></div>
  </div>
}
export default function Sidebar({onLogout,onNavigate}:{onLogout:()=>void;onNavigate?:()=>void}) {
  const {profile,destinations,counts,error,updatedAt}=useAdminWorkspace()
  const groups=[...new Set(destinations.map(item=>item.group))]
  function links(group:string) {
    return destinations.filter(item=>item.group===group).map(item=>{
      const Icon=navigationIcons[item.icon]||Home
      const count=item.badge?counts[item.badge]:null
      return <NavLink key={item.to} to={item.to} end className={({isActive})=>`admin-nav-link ${isActive?'is-active':''}`} onClick={onNavigate}>
        <Icon size={19} aria-hidden="true" /><span>{item.label}</span>
        {count!==null && count>0 && <span className="admin-count" aria-label={`${count} registros`}>{count>99?'99+':count}</span>}
      </NavLink>
    })
  }
  return <aside className="admin-sidebar" aria-label="Menu completo">
    <AdminBrand />
    <div className="admin-workspace-label"><span className="admin-live-dot" />{profile.role==='sysadmin'?'Painel do proprietário':'Painel da equipe'}</div>
    <nav aria-label="Navegação principal" className="admin-sidebar-nav">
      {groups.map(group=>group==='Canais de suporte'?<details key={group} className="admin-nav-channels"><summary>{group}</summary>{links(group)}</details>:
        <section key={group}><h2>{group}</h2>{links(group)}</section>)}
    </nav>
    <div className="admin-sidebar-footer">
      <div className="admin-session"><span className="admin-avatar">{(profile.nome||profile.email||'A').slice(0,1).toUpperCase()}</span><div><strong>{profile.nome||'Administrador'}</strong><small>{profile.role==='sysadmin'?'Proprietário · nível 5':'Equipe · acesso atribuído'}</small></div></div>
      <p className={error?'admin-sync-warning':''}>{error?'Contadores indisponíveis':updatedAt?`Filas consultadas às ${updatedAt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`:'Consultando filas…'}</p>
      <button className="admin-signout" onClick={onLogout}><LogOut size={16} /> Encerrar sessão</button>
    </div>
  </aside>
}
