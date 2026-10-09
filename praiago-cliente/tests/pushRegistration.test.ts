import { describe,it,expect,vi,beforeEach } from 'vitest'
const mock=vi.hoisted(()=>({
 listeners:new Map<string,(value:any)=>void>(),prefs:new Map<string,string>(),
 user:'user-a',rpc:vi.fn(async()=>({error:null})),
 register:vi.fn(async()=>{}),unregister:vi.fn(async()=>{}),clear:vi.fn(async()=>{}),
 permission:'granted',channels:vi.fn(async()=>{}),native:true,
 capabilities:vi.fn(async()=>({orderProgressV1:false})),
}))
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>mock.native,getPlatform:()=> 'android',isPluginAvailable:()=>true},registerPlugin:()=>({capabilities:mock.capabilities})}))
vi.mock('@capacitor/preferences',()=>({Preferences:{
 get:async({key}:{key:string})=>({value:mock.prefs.get(key)||null}),
 set:async({key,value}:{key:string,value:string})=>{mock.prefs.set(key,value)},
 remove:async({key}:{key:string})=>{mock.prefs.delete(key)},
}}))
vi.mock('@capacitor/push-notifications',()=>({PushNotifications:{
 addListener:async(name:string,fn:(value:any)=>void)=>{mock.listeners.set(name,fn);return{remove:async()=>{if(mock.listeners.get(name)===fn)mock.listeners.delete(name)}}},
 checkPermissions:async()=>({receive:mock.permission}),requestPermissions:async()=>({receive:mock.permission}),
 register:mock.register,unregister:mock.unregister,removeAllDeliveredNotifications:mock.clear,createChannel:mock.channels,
}}))
vi.mock('../src/lib/supabase',()=>({supabase:{auth:{getUser:async()=>({data:{user:{id:mock.user}},error:null})},rpc:mock.rpc}}))
const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve()}
beforeEach(()=>{mock.listeners.clear();mock.prefs.clear();mock.user='user-a';mock.permission='granted';mock.capabilities.mockResolvedValue({orderProgressV1:false});mock.rpc.mockResolvedValue({error:null});mock.rpc.mockClear();vi.resetModules()})
describe('vínculo seguro do aparelho',()=>{
 it('registra apenas o usuário autenticado',async()=>{
  const push=await import('../src/lib/pushNotifications')
  const stop=push.startPush('user-a',vi.fn(),vi.fn());await settle()
  mock.listeners.get('registration')?.({value:'token-a-long-enough'})
  await settle()
  expect(mock.rpc).toHaveBeenCalledWith('register_push_device',expect.objectContaining({p_app:'cliente',p_platform:'android',p_token:'token-a-long-enough'}))
  stop()
 })
 it('declara progresso apenas com capacidade da nova versão nativa',async()=>{
  mock.capabilities.mockResolvedValue({orderProgressV1:true})
  const push=await import('../src/lib/pushNotifications')
  const stop=push.startPush('user-a',vi.fn(),vi.fn());await settle()
  mock.listeners.get('registration')?.({value:'token-a-long-enough'});await settle()
  expect(mock.rpc).toHaveBeenCalledWith('register_push_device_v2',expect.objectContaining({p_order_progress_v1:true}))
  stop()
 })
 it('volta ao aviso padrão se a migração ainda não foi aplicada',async()=>{
  mock.capabilities.mockResolvedValue({orderProgressV1:true})
  mock.rpc.mockImplementation(async(name:string)=>({error:name==='register_push_device_v2'?{code:'PGRST202'}:null}))
  const push=await import('../src/lib/pushNotifications')
  const stop=push.startPush('user-a',vi.fn(),vi.fn());await settle()
  mock.listeners.get('registration')?.({value:'token-a-long-enough'});await settle()
  expect(mock.rpc).toHaveBeenCalledWith('register_push_device',expect.objectContaining({p_app:'cliente'}))
  stop()
 })
 it('rejeita sessão local divergente e destino arbitrário',async()=>{
  const push=await import('../src/lib/pushNotifications');const open=vi.fn(),refresh=vi.fn()
  const stop=push.startPush('different-user',open,refresh);await settle()
  mock.listeners.get('registration')?.({value:'token-secret'});await settle()
  expect(mock.rpc).not.toHaveBeenCalledWith('register_push_device',expect.anything())
  mock.listeners.get('pushNotificationActionPerformed')?.({notification:{data:{app:'cliente',pedido_id:'https://evil.example'}}})
  mock.listeners.get('pushNotificationActionPerformed')?.({notification:{data:{app:'ambulante',pedido_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}}})
  expect(open).not.toHaveBeenCalled()
  mock.listeners.get('pushNotificationActionPerformed')?.({notification:{data:{app:'cliente',pedido_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}}})
  expect(open).toHaveBeenCalledWith('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');stop()
 })
 it('desliga vínculo e remove notificações ao sair',async()=>{
  const push=await import('../src/lib/pushNotifications')
  push.startPush('user-a',vi.fn(),vi.fn());await settle()
  await push.disconnectPush()
  expect(mock.rpc).toHaveBeenCalledWith('revoke_push_device',expect.objectContaining({p_app:'cliente'}))
  expect(mock.unregister).toHaveBeenCalled();expect(mock.clear).toHaveBeenCalled()
  expect(mock.listeners.size).toBe(0)
 })
 it('não registra permissão negada e ignora listeners removidos',async()=>{
  mock.permission='denied'
  const push=await import('../src/lib/pushNotifications')
  const stop=push.startPush('user-a',vi.fn(),vi.fn());await settle()
  expect(mock.register).not.toHaveBeenCalled();stop()
  expect(mock.listeners.size).toBe(0)
 })
})
