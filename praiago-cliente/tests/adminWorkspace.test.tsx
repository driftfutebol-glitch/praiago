import {beforeEach,expect,it,vi} from 'vitest'
import {Fragment} from 'react'
import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {MemoryRouter,Route,Routes} from 'react-router-dom'
import AdminShell from '../../praiago-admin/src/components/AdminShell'
import ResponsiveTable from '../../praiago-admin/src/components/ResponsiveTable'
import LoginPage from '../../praiago-admin/src/pages/LoginPage'
import DashboardPage from '../../praiago-admin/src/pages/DashboardPage'
import {allowedDestinations,canAccessAdmin,currentDestination,searchDestinations,type AdminProfile} from '../../praiago-admin/src/lib/adminNavigation'
import {dashboardMetrics,dashboardWindow} from '../../praiago-admin/src/lib/dashboardMetrics'
const state=vi.hoisted(()=>({fail:false,queries:[] as string[],login:vi.fn(),audit:vi.fn(),signout:vi.fn(),role:'admin',data:[] as unknown[],periodCount:0}))
vi.mock('../../praiago-admin/src/lib/securityAudit',()=>({logSecurityEvent:state.audit}))
vi.mock('../../praiago-admin/src/lib/supabase',()=>({
  supabase:{
    from:(table:string)=>{
      state.queries.push(table)
      let head=false,single=false
      const query:any={
        select:(_fields:string,options?:{head?:boolean})=>{head=options?.head===true;return query},
        eq:()=>query,neq:()=>query,or:()=>query,in:()=>query,not:()=>query,gte:()=>query,order:()=>query,limit:()=>query,
        maybeSingle:()=>{single=true;return query},
        then:(resolve:any)=>Promise.resolve({error:state.fail?{message:'Indisponível'}:null,count:head?0:state.periodCount,data:single?{role:state.role,status:'ativo'}:head?null:state.data}).then(resolve)
      };return query
    },
    channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:vi.fn(),
    auth:{signInWithPassword:state.login,signOut:state.signout,resetPasswordForEmail:vi.fn()}
  }
}))
const owner:AdminProfile={id:'qa',nome:'QA',email:'qa@example.invalid',role:'sysadmin',permissions:null}
beforeEach(()=>{
  state.fail=false;state.queries=[];state.data=[];state.periodCount=0;state.role='admin'
  state.login.mockReset().mockResolvedValue({data:{user:{id:'qa'}},error:null});state.audit.mockReset().mockResolvedValue(undefined);state.signout.mockReset().mockResolvedValue({error:null})
  HTMLElement.prototype.scrollTo=vi.fn()
  HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new Event('close'))}
})
it.each(['dashboard','pedidos','financeiro','usuarios','erros','admins','atualizacoes'])('o proprietário acessa a seção %s',section=>{expect(canAccessAdmin(owner,section,true)).toBe(true)})
it('admin legado conserva seções normais, mas não acessa gestão exclusiva',()=>{
  const admin={...owner,role:'admin'}
  expect(canAccessAdmin(admin,'financeiro')).toBe(true)
  expect(allowedDestinations(admin).some(item=>item.ownerOnly)).toBe(false)
})
it('lista vazia de permissões não vira acesso irrestrito',()=>{expect(allowedDestinations({...owner,role:'admin',permissions:[]})).toEqual([])})
it('conta comum não ganha navegação administrativa',()=>{expect(allowedDestinations({...owner,role:'cliente'})).toEqual([])})
it('a busca normaliza acentos e não revela opções bloqueadas',()=>{
  const items=allowedDestinations({...owner,role:'admin',permissions:['usuarios']})
  expect(searchDestinations(items,'usuarios').some(item=>item.to==='/usuarios')).toBe(true)
  expect(searchDestinations(items,'financeiro')).toEqual([])
  expect(searchDestinations(items,'novos cadastros')).toHaveLength(1)
})
it('identifica a página sem confundir o caminho inicial',()=>{expect(currentDestination('/pedidos')?.label).toBe('Pedidos');expect(currentDestination('/erros/detalhe')?.section).toBe('erros');expect(currentDestination('/desconhecido')).toBeUndefined()})
it('um admin sem dashboard não busca dados de filas não autorizadas',async()=>{
  render(<MemoryRouter><AdminShell profile={{...owner,role:'admin',permissions:['pedidos']}} onLogout={()=>{}}>Conteúdo</AdminShell></MemoryRouter>)
  await waitFor(()=>expect(screen.getByRole('button',{name:'Central de pendências: 0'})).toBeDefined())
  expect(state.queries).toEqual([])
  expect(screen.queryByRole('link',{name:'Financeiro',exact:true})).toBeNull()
})
it('abre busca acessível e fecha o painel ao navegar',async()=>{
  render(<MemoryRouter><AdminShell profile={owner} onLogout={()=>{}}><Routes><Route path="*" element={<p>Conteúdo</p>}/></Routes></AdminShell></MemoryRouter>)
  fireEvent.click(screen.getByRole('button',{name:'Buscar opções no painel'}))
  const dialog=screen.getByRole('dialog',{name:'Buscar no painel'})
  fireEvent.change(within(dialog).getByRole('textbox'),{target:{value:'seguranca'}})
  const destination=within(dialog).getByRole('link',{name:/Segurança e logs/})
  expect(within(dialog).queryByRole('link',{name:/Financeiro/})).toBeNull()
  fireEvent.click(destination)
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
})
it('atalhos e sessão não alteram registros automaticamente',async()=>{
  const logout=vi.fn()
  render(<MemoryRouter><AdminShell profile={owner} onLogout={logout}>Conteúdo</AdminShell></MemoryRouter>)
  fireEvent.click(screen.getByRole('button',{name:'Abrir atalhos rápidos'}));expect(screen.getByRole('dialog',{name:'Atalhos rápidos'})).toBeDefined()
  fireEvent.click(screen.getByRole('button',{name:'Fechar opções'}))
  fireEvent.click(screen.getByRole('button',{name:'Abrir informações da sessão'}))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Encerrar sessão'}))
  expect(logout).toHaveBeenCalledTimes(1);expect(state.signout).not.toHaveBeenCalled()
})
it('falha nas filas é mostrada como indisponibilidade, não como zero',async()=>{
  state.fail=true
  render(<MemoryRouter><AdminShell profile={owner} onLogout={()=>{}}>Conteúdo</AdminShell></MemoryRouter>)
  await screen.findByText('Contadores indisponíveis')
  fireEvent.click(screen.getByRole('button',{name:'Central de pendências',exact:true}))
  expect(within(screen.getByRole('dialog')).getByRole('alert')).toBeDefined()
  expect(within(screen.getByRole('dialog')).getAllByText('—')).toHaveLength(4)
})
it('a tabela preserva cabeçalhos, ações únicas e cartões sem duplicação',()=>{
  const action=vi.fn()
  render(<ResponsiveTable label="Pedidos"><thead><tr><th>ID</th><th>Cliente</th><th>Ação</th></tr></thead><tbody>{[1,2].map(id=><tr key={id}><td>{id}</td><td>QA</td><td><button onClick={action}>Abrir {id}</button></td></tr>)}<tr><td colSpan={3}>Nenhum outro pedido</td></tr></tbody></ResponsiveTable>)
  const buttons=screen.getAllByRole('button');expect(buttons).toHaveLength(2)
  expect(screen.getAllByRole('cell')[1].getAttribute('data-label')).toBe('Cliente')
  expect(screen.getByText('Nenhum outro pedido').getAttribute('data-label')).toBe('')
  fireEvent.click(buttons[0]);expect(action).toHaveBeenCalledTimes(1)
})
it('rótulos funcionam em linhas encapsuladas e com colunas condicionais',()=>{
  render(<ResponsiveTable label="Suporte"><thead><tr><th>ID</th>{false&&<th>Oculto</th>}<th>Ação</th></tr></thead><tbody><Fragment><tr><td>QA</td>{false&&<td>Oculto</td>}<td><button>Abrir</button></td></tr></Fragment></tbody></ResponsiveTable>)
  expect(screen.getByRole('button').closest('td')?.getAttribute('data-label')).toBe('Ação')
})
it('calcula sete dias em Brasília e arredonda valores em centavos',()=>{
  const now=new Date('2026-09-29T01:00:00Z')
  expect(dashboardWindow(now).start).toBe('2026-09-22T00:00:00-03:00')
  const metrics=dashboardMetrics([{id:'1',created_at:'2026-09-29T01:00:00Z',status:'entregue',total:'49.90'},{id:'2',created_at:'2026-09-28T10:00:00Z',status:'entregue',total:'43.00'},{id:'3',created_at:'2026-09-28T10:00:00Z',status:'cancelado',total:999},{id:'4',created_at:'2026-01-01',status:'entregue',total:999},{id:'5',created_at:'invalid',status:'entregue',total:999}],now)
  expect(metrics.deliveredCents).toBe(9290);expect(metrics.daily.at(-1)?.count).toBe(3)
})
it('valores inválidos não contaminam o gráfico ou a soma',()=>{
  const now=new Date('2026-09-28T15:00:00Z')
  const metrics=dashboardMetrics([{id:'1',created_at:now.toISOString(),status:'entregue',total:'NaN'},{id:'2',created_at:now.toISOString(),status:'entregue',total:-3}],now)
  expect(metrics.deliveredCents).toBe(0);expect(metrics.maximum).toBe(2);expect(metrics.missingTotals).toBe(2)
})
it('dashboard marca o limite da amostra e não chama volume de saldo',async()=>{
  state.periodCount=700
  render(<MemoryRouter><AdminShell profile={owner} onLogout={()=>{}}><DashboardPage/></AdminShell></MemoryRouter>)
  await screen.findByText(/Amostra: últimos 500 de 700 pedidos/)
  expect(screen.getByText('Volume entregue · amostra')).toBeDefined()
  expect(screen.queryByText('Faturamento Total')).toBeNull()
})
it('dashboard limitado não busca pedidos nem mostra financeiro',async()=>{
  render(<MemoryRouter><AdminShell profile={{...owner,role:'admin',permissions:['dashboard']}} onLogout={()=>{}}><DashboardPage/></AdminShell></MemoryRouter>)
  await waitFor(()=>expect(screen.getByText(/Consultado às/)).toBeDefined())
  expect(state.queries).toEqual([]);expect(screen.queryByText(/Volume entregue/)).toBeNull()
})
it('campos de login têm rótulos e alternância de senha sem transmissão',()=>{
  render(<LoginPage onLogin={()=>{}}/>)
  expect(screen.getByLabelText('E-mail de acesso').getAttribute('type')).toBe('email')
  expect(screen.getByLabelText('Senha').getAttribute('type')).toBe('password')
  fireEvent.click(screen.getByRole('button',{name:'Mostrar senha'}))
  expect(screen.getByLabelText('Senha').getAttribute('type')).toBe('text')
  expect(state.login).not.toHaveBeenCalled()
})
it('o novo login continua rejeitando uma conta sem papel administrativo',async()=>{
  state.role='cliente';const onLogin=vi.fn()
  render(<LoginPage onLogin={onLogin}/>)
  fireEvent.change(screen.getByLabelText('E-mail de acesso'),{target:{value:'qa@example.invalid'}});fireEvent.change(screen.getByLabelText('Senha'),{target:{value:'senha-de-teste'}})
  fireEvent.submit(screen.getByRole('button',{name:'Entrar no painel'}).closest('form')!)
  expect(await screen.findByText(/Esta conta não tem acesso administrativo/)).toBeDefined()
  expect(onLogin).not.toHaveBeenCalled();expect(state.signout).toHaveBeenCalledTimes(1);expect(state.audit).toHaveBeenCalledWith('access_denied','qa@example.invalid',expect.any(Object))
})
