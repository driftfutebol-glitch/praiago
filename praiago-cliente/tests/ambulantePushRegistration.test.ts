import {beforeEach,describe,expect,it,vi} from 'vitest'

const mock=vi.hoisted(()=>{
  const listeners=new Map<string,(event:any)=>void>()
  const prefs=new Map<string,string>()
  return {
    listeners,prefs,permission:'granted',user:'seller-a',
    register:vi.fn(async()=>{}),rpc:vi.fn(async()=>({error:null})),
    addListener:vi.fn(async(name:string,fn:(event:any)=>void)=>{
      listeners.set(name,fn)
      return {remove:async()=>{if(listeners.get(name)===fn)listeners.delete(name)}}
    }),
  }
})

vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'android'}}))
vi.mock('@capacitor/preferences',()=>({Preferences:{
  get:async({key}:{key:string})=>({value:mock.prefs.get(key)||null}),
  set:async({key,value}:{key:string,value:string})=>{mock.prefs.set(key,value)},
  remove:async({key}:{key:string})=>{mock.prefs.delete(key)},
}}))
vi.mock('@capacitor/push-notifications',()=>({PushNotifications:{
  addListener:mock.addListener,
  checkPermissions:async()=>({receive:mock.permission}),
  requestPermissions:async()=>({receive:mock.permission}),
  register:mock.register,
  unregister:vi.fn(async()=>{}),
  removeAllDeliveredNotifications:vi.fn(async()=>{}),
  createChannel:vi.fn(async()=>{}),
}}))
vi.mock('../../praiago-ambulante/src/lib/supabase',()=>({supabase:{
  auth:{getUser:async()=>({data:{user:{id:mock.user}},error:null})},
  rpc:mock.rpc,
}}))

const settle=async()=>{for(let index=0;index<60;index++)await Promise.resolve()}
beforeEach(()=>{
  mock.listeners.clear();mock.prefs.clear();mock.permission='granted';mock.user='seller-a'
  vi.resetModules()
})

describe('registro de notificações do Ambulante',()=>{
  it('registra automaticamente após permissão e confirma o vínculo no servidor',async()=>{
    const push=await import('../../praiago-ambulante/src/lib/pushNotifications')
    const stop=push.startPush('seller-a',vi.fn(),vi.fn())
    await settle()
    expect(mock.addListener).toHaveBeenCalled()
    expect(mock.register).toHaveBeenCalledOnce()
    expect(push.usePushState).toBeDefined()
    mock.listeners.get('registration')?.({value:'token-fcm-ambulante-suficiente'})
    await settle()
    expect(mock.rpc).toHaveBeenCalledWith('register_push_device',expect.objectContaining({
      p_app:'ambulante',p_platform:'android',p_token:'token-fcm-ambulante-suficiente',
    }))
    mock.rpc.mockClear()
    mock.permission='denied'
    push.recheckPushRegistration()
    await settle()
    expect(mock.rpc).not.toHaveBeenCalledWith('register_push_device',expect.anything())
    stop()
  })

  it('aguarda os listeners nativos antes de registrar ao autorizar no Perfil',async()=>{
    let release:()=>void=()=>{}
    const gate=new Promise<void>(resolve=>{release=resolve})
    mock.permission='prompt'
    mock.addListener.mockImplementationOnce(async(name:string,fn:(event:any)=>void)=>{
      await gate
      mock.listeners.set(name,fn)
      return {remove:async()=>{mock.listeners.delete(name)}}
    })
    const push=await import('../../praiago-ambulante/src/lib/pushNotifications')
    const stop=push.startPush('seller-a',vi.fn(),vi.fn())
    mock.permission='granted'
    const enabling=push.enablePush()
    await settle()
    expect(mock.register).not.toHaveBeenCalled()
    release()
    await enabling
    await settle()
    expect(mock.register).toHaveBeenCalledOnce()
    stop()
  })

  it('não considera ativado quando o Android não entrega token',async()=>{
    const push=await import('../../praiago-ambulante/src/lib/pushNotifications')
    const stop=push.startPush('seller-a',vi.fn(),vi.fn())
    await settle()
    mock.listeners.get('registrationError')?.({error:'FCM unavailable'})
    await settle()
    expect(mock.rpc).not.toHaveBeenCalledWith('register_push_device',expect.anything())
    stop()
  })

  it('não vincula token a uma sessão de outra conta',async()=>{
    mock.user='seller-b'
    const push=await import('../../praiago-ambulante/src/lib/pushNotifications')
    const stop=push.startPush('seller-a',vi.fn(),vi.fn())
    await settle()
    mock.listeners.get('registration')?.({value:'token-fcm-ambulante-suficiente'})
    await settle()
    expect(mock.rpc).not.toHaveBeenCalledWith('register_push_device',expect.anything())
    mock.user='seller-a'
    push.recheckPushRegistration()
    await settle()
    expect(mock.rpc).toHaveBeenCalledWith('register_push_device',expect.objectContaining({p_app:'ambulante'}))
    stop()
  })

  it('não registra a nova conta antes de revogar um vínculo pendente',async()=>{
    mock.rpc.mockImplementation(async(name:string)=>({error:name==='revoke_push_device'?{message:'offline'}:null}))
    const push=await import('../../praiago-ambulante/src/lib/pushNotifications')
    const stop=push.startPush('seller-a',vi.fn(),vi.fn())
    await settle()
    mock.prefs.set('praiago-push-ambulante-revoke-pending','true')
    mock.listeners.get('registration')?.({value:'token-fcm-ambulante-suficiente'})
    await settle()
    expect(mock.rpc).toHaveBeenCalledWith('revoke_push_device',expect.anything())
    expect(mock.rpc).not.toHaveBeenCalledWith('register_push_device',expect.anything())
    stop()
  })
})
