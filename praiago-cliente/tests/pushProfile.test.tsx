import {beforeEach,describe,expect,it,vi} from 'vitest'
import {render,screen,fireEvent,waitFor} from '@testing-library/react'
const mock=vi.hoisted(()=>({
 state:{supported:true,registered:true,busy:false,permission:'granted',message:''},
 rpc:vi.fn(), native:true, enable:vi.fn(),preview:vi.fn(),settings:vi.fn(),
}))
vi.mock('../src/lib/pushNotifications',()=>({usePushState:()=>mock.state,enablePush:mock.enable}))
vi.mock('../src/lib/supabase',()=>({supabase:{rpc:mock.rpc}}))
vi.mock('../src/lib/nativeNotificationOptions',()=>({hasNotificationOptions:()=>mock.native,previewNotificationSound:mock.preview,openNotificationSettings:mock.settings}))
vi.mock('../src/store/useStore',()=>({useStore:(selector:(value:unknown)=>unknown)=>selector({sessao:{id:'test-user'}})}))
import PushNotificationSetting from '../src/components/PushNotificationSetting'
beforeEach(()=>{mock.state={supported:true,registered:true,busy:false,permission:'granted',message:''};mock.native=true;mock.rpc.mockReset();mock.rpc.mockResolvedValue({data:false,error:null});mock.preview.mockClear();mock.settings.mockClear()})
describe('Central de notificações do Perfil',()=>{
 it('novidades são opcionais e não ativadas automaticamente',async()=>{
  render(<PushNotificationSetting/>)
  const toggle=screen.getByRole('switch',{name:'Receber novidades do PraiaGo'})
  await waitFor(()=>expect((toggle as HTMLInputElement).disabled).toBe(false))
  expect((toggle as HTMLInputElement).checked).toBe(false)
  expect(mock.rpc).toHaveBeenCalledWith('get_push_preference',{p_app:'cliente'})
  expect(mock.rpc).not.toHaveBeenCalledWith('set_push_preference',expect.anything())
 })
 it('salva opção própria com confirmação do servidor',async()=>{
  render(<PushNotificationSetting/>)
  const toggle=screen.getByRole('switch',{name:'Receber novidades do PraiaGo'})
  await waitFor(()=>expect((toggle as HTMLInputElement).disabled).toBe(false));fireEvent.click(toggle)
  await waitFor(()=>expect((toggle as HTMLInputElement).checked).toBe(true))
  expect(mock.rpc).toHaveBeenCalledWith('set_push_preference',{p_app:'cliente',p_enabled:true})
 })
 it('mantém preferência anterior em falha',async()=>{
  mock.rpc.mockImplementation(async(name:string)=>({data:false,error:name==='set_push_preference'?{message:'network'}:null}))
  render(<PushNotificationSetting/>)
  const toggle=screen.getByRole('switch',{name:'Receber novidades do PraiaGo'})
  await waitFor(()=>expect((toggle as HTMLInputElement).disabled).toBe(false));fireEvent.click(toggle)
  await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('preferência anterior'))
  expect((toggle as HTMLInputElement).checked).toBe(false)
 })
 it('APK antigo não chama plugin nativo ausente',async()=>{
  mock.native=false;render(<PushNotificationSetting/>)
  expect((screen.getByRole('button',{name:'Ouvir som PraiaGo'}) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByRole('button',{name:'Ajustar no Android'}) as HTMLButtonElement).disabled).toBe(true)
  expect(mock.preview).not.toHaveBeenCalled()
 })
 it('som e configurações usam somente atalhos locais',async()=>{
  render(<PushNotificationSetting/>)
  fireEvent.click(screen.getByRole('button',{name:'Ouvir som PraiaGo'}))
  fireEvent.click(screen.getByRole('button',{name:'Ajustar no Android'}))
  await waitFor(()=>expect(mock.preview).toHaveBeenCalledOnce())
  expect(mock.settings).toHaveBeenCalledOnce()
 })
 it('não mostra ativação nativa em navegador web',()=>{
  mock.state.supported=false;render(<PushNotificationSetting/>)
  expect(screen.queryByRole('switch')).toBeNull()
 })
})
