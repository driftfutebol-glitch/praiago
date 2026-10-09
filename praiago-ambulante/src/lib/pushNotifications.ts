import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { PushNotifications } from '@capacitor/push-notifications'
import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { campaignDestination } from '../../../mobile/pushCampaignAction'

export type PushState = { supported:boolean; permission:'prompt'|'granted'|'denied'; registered:boolean; busy:boolean; message:string }
const app='ambulante' as 'cliente'|'ambulante'
const native=Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android'
let state:PushState={supported:native,permission:'prompt',registered:false,busy:false,message:''}
const subscribers=new Set<()=>void>()
function update(next:Partial<PushState>){state={...state,...next};subscribers.forEach(fn=>fn())}
export function usePushState(){return useSyncExternalStore(fn=>{subscribers.add(fn);return()=>{subscribers.delete(fn)}},()=>state,()=>state)}
const prefix='praiago-push-'+app
type Installation={id:string;secret:string}
let epoch=0,currentUser:string|null=null,handles:Array<{remove:()=>Promise<void>}>=[],pendingOrder:string|null=null
let token:string|null=null
let activeCleanup:(()=>void)|null=null
let activePermissionCheck:((refreshExisting?:boolean)=>Promise<void>)|null=null
let registrationReady:Promise<boolean>=Promise.resolve(false)
let registrationEpoch:number|null=null
let registrationTimer:number|null=null
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
async function installation():Promise<Installation>{
  const stored=await Preferences.get({key:prefix+'-installation'})
  if(stored.value){try{const value=JSON.parse(stored.value);if(uuid.test(value.id)&&/^[0-9a-f]{64}$/.test(value.secret))return value}catch{/* replace malformed local data */}}
  const value={id:crypto.randomUUID(),secret:Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('')}
  await Preferences.set({key:prefix+'-installation',value:JSON.stringify(value)})
  return value
}
async function revokePending(){
  const pending=await Preferences.get({key:prefix+'-revoke-pending'})
  if(pending.value!=='true')return true
  const device=await installation()
  const {error}=await supabase.rpc('revoke_push_device',{p_installation_id:device.id,p_app:app,p_revoke_secret:device.secret})
  if(error)return false
  await Preferences.remove({key:prefix+'-revoke-pending'})
  return true
}
export async function disconnectPush(){
  if(!native)return
  epoch++;currentUser=null;token=null;pendingOrder=null
  finishRegistration()
  update({registered:false,busy:false})
  activeCleanup?.();activeCleanup=null
  activePermissionCheck=null
  const previous=handles;handles=[]
  await Promise.allSettled(previous.map(handle=>handle.remove()))
  await Preferences.set({key:prefix+'-revoke-pending',value:'true'})
  await Promise.allSettled([revokePending(),PushNotifications.unregister(),PushNotifications.removeAllDeliveredNotifications()])
}
let registrationQueue:Promise<void>=Promise.resolve()
function finishRegistration(){
  if(registrationTimer!==null){window.clearTimeout(registrationTimer);registrationTimer=null}
  registrationEpoch=null
}
async function registerWithAndroid(capturedEpoch:number){
  if(!currentUser||capturedEpoch!==epoch||registrationEpoch===capturedEpoch)return
  registrationEpoch=capturedEpoch
  update({busy:true,message:'Permissão autorizada. Verificando o registro deste aparelho…'})
  registrationTimer=window.setTimeout(()=>{
    if(capturedEpoch!==epoch||registrationEpoch!==capturedEpoch)return
    finishRegistration()
    update({registered:false,busy:false,message:'A permissão foi autorizada, mas o Android não confirmou o registro. Instale a nova versão do PraiaGo Ambulante e tente novamente.'})
  },15000)
  try{await PushNotifications.register()}
  catch{
    if(capturedEpoch!==epoch)return
    finishRegistration()
    update({registered:false,busy:false,message:'O Android não conseguiu registrar este aparelho. Confira a versão instalada e tente novamente.'})
  }
}
function saveToken(value:string,capturedEpoch:number){
  registrationQueue=registrationQueue.catch(()=>{}).then(()=>persistToken(value,capturedEpoch))
  return registrationQueue
}
async function persistToken(value:string,capturedEpoch:number){
  if(!currentUser||capturedEpoch!==epoch)return
  const user=currentUser
  try{
    const {data,error:authError}=await supabase.auth.getUser()
    if(capturedEpoch!==epoch)return
    if(authError||data.user?.id!==user){
      update({registered:false,busy:false,message:authError?'Não foi possível confirmar sua sessão. Conecte-se à internet e tente novamente.':'A conta do aparelho mudou. Entre novamente antes de ativar os avisos.'})
      return
    }
    const device=await installation()
    // Complete a previous logout before rebinding this installation.
    if(!await revokePending()){
      update({registered:false,busy:false,message:'Não foi possível concluir a troca de conta. Conecte-se à internet e tente novamente.'})
      return
    }
    if(capturedEpoch!==epoch)return
    const {error}=await supabase.rpc('register_push_device',{p_installation_id:device.id,p_app:app,p_platform:'android',p_token:value,p_revoke_secret:device.secret})
    if(capturedEpoch!==epoch){
      await Preferences.set({key:prefix+'-revoke-pending',value:'true'});await revokePending();return
    }
    update({registered:!error,busy:false,message:error?'Não foi possível registrar os avisos. Toque em ativar para tentar novamente.':'Este aparelho está preparado para receber atualizações dos pedidos.'})
  }catch{
    if(capturedEpoch===epoch)update({registered:false,busy:false,message:'Falha de conexão ao verificar este aparelho. Tente novamente.'})
  }
}
function safeOrder(notification:{data?:Record<string,unknown>}){
  const data=notification.data||{}
  if(data.app!==app||typeof data.pedido_id!=='string'||!uuid.test(data.pedido_id))return null
  return data.pedido_id
}
export function startPush(userId:string|null,onOrder:(id:string)=>void,onRefresh:()=>void,onCampaign?:(destination:'home'|'orders')=>void){
  if(!native)return()=>{}
  let disposed=false
  const myEpoch=++epoch
  currentUser=userId
  token=null
  finishRegistration()
  update({registered:false,busy:false,message:''})
  let resolveReady:(ready:boolean)=>void=()=>{}
  registrationReady=new Promise<boolean>(resolve=>{resolveReady=resolve})
  const openOrder=(id:string)=>{
    if(disposed||myEpoch!==epoch)return
    if(!currentUser){pendingOrder=id;return}
    onOrder(id);onRefresh()
  }
  const onOnline=()=>{void(async()=>{
    try{
      if(!await revokePending())return
      await checkPermission(true)
    }catch{if(myEpoch===epoch)update({registered:false,busy:false,message:'A conexão voltou, mas ainda não foi possível verificar o aparelho.'})}
  })()}
  window.addEventListener('online',onOnline)
  const visible=()=>{if(document.visibilityState==='visible'){onRefresh();void checkPermission()}}
  document.addEventListener('visibilitychange',visible)
  activeCleanup=()=>{window.removeEventListener('online',onOnline);document.removeEventListener('visibilitychange',visible)}
  async function checkPermission(refreshExisting=false){
    if(disposed||myEpoch!==epoch)return
    try{
      const result=await PushNotifications.checkPermissions()
      if(disposed||myEpoch!==epoch)return
      const permission=result.receive==='granted'?'granted':result.receive==='denied'?'denied':'prompt'
      update({permission,...(permission!=='granted'?{registered:false}: {})})
      if(permission==='granted'&&currentUser){
        const ready=await registrationReady
        if(disposed||myEpoch!==epoch)return
        if(!ready){update({registered:false,busy:false,message:'Serviço de notificações indisponível. Feche e abra o aplicativo e tente novamente.'});return}
        if(token&&(refreshExisting||!state.registered))await saveToken(token,myEpoch)
        else if(!state.registered)await registerWithAndroid(myEpoch)
      }
    }catch{
      if(!disposed&&myEpoch===epoch)update({registered:false,busy:false,message:'Não foi possível verificar a permissão do Android. Abra o Perfil e tente novamente.'})
    }
  }
  activePermissionCheck=checkPermission
  void(async()=>{
    try{
      await revokePending()
      const listeners=await Promise.all([
        PushNotifications.addListener('registration',event=>{if(myEpoch===epoch&&!disposed){finishRegistration();token=event.value;void saveToken(event.value,myEpoch)}}),
        PushNotifications.addListener('registrationError',()=>{if(myEpoch!==epoch||disposed)return;finishRegistration();token=null;update({registered:false,busy:false,message:'O serviço de notificações não confirmou este aparelho. Confira a nova versão do aplicativo e tente novamente.'})}),
        PushNotifications.addListener('pushNotificationReceived',notification=>{if(myEpoch===epoch&&currentUser&&safeOrder(notification))onRefresh()}),
        PushNotifications.addListener('pushNotificationActionPerformed',event=>{
          if(myEpoch!==epoch||disposed)return
          const destination=campaignDestination(event.notification.data||{},app,currentUser)
          if(destination){onCampaign?.(destination);return}
          const id=safeOrder(event.notification);if(id)openOrder(id)
        }),
      ])
      if(disposed||myEpoch!==epoch){resolveReady(false);await Promise.allSettled(listeners.map(handle=>handle.remove()));return}
      handles=listeners
      await PushNotifications.createChannel({id:app==='ambulante'?'novos_pedidos':'atualizacoes_pedidos',name:app==='ambulante'?'Novos pedidos':'Atualizações de pedidos',description:'Avisos sobre seus pedidos no PraiaGo',importance:4,visibility:0,vibration:true})
      if(app==='ambulante')await PushNotifications.createChannel({id:'atualizacoes_pedidos',name:'Atualizações de pedidos',description:'Preparo, entrega e cancelamentos',importance:3,visibility:0,vibration:true})
      resolveReady(true)
      if(currentUser&&pendingOrder){const id=pendingOrder;pendingOrder=null;openOrder(id)}
      await checkPermission()
    }catch{resolveReady(false);if(!disposed&&myEpoch===epoch)update({busy:false,message:'Atualize o aplicativo para usar as notificações do celular.'})}
  })()
  return()=>{
    disposed=true
    resolveReady(false)
    if(myEpoch!==epoch)return
    epoch++
    finishRegistration()
    activeCleanup?.();activeCleanup=null
    activePermissionCheck=null
    const previous=handles;handles=[];void Promise.allSettled(previous.map(handle=>handle.remove()))
    update({registered:false})
  }
}
export function recheckPushRegistration(){
  if(!native||!currentUser)return
  void activePermissionCheck?.(true)
}
export async function enablePush(){
  if(!native||!currentUser||state.busy)return
  const captured=epoch
  update({busy:true,message:''})
  try{
    const permission=await PushNotifications.requestPermissions()
    if(captured!==epoch)return
    if(permission.receive!=='granted'){update({permission:'denied',busy:false,registered:false,message:'Permita as notificações nas configurações do Android para receber avisos fora do app.'});return}
    update({permission:'granted'})
    const ready=await registrationReady
    if(captured!==epoch)return
    if(!ready){update({busy:false,registered:false,message:'Não foi possível iniciar o serviço de notificações. Feche e abra o aplicativo e tente novamente.'});return}
    await registerWithAndroid(captured)
  }catch{if(captured===epoch)update({busy:false,registered:false,message:'Não foi possível ativar. Confira sua conexão e a versão do aplicativo.'})}
}
export function hasNativePushSound(){return native&&state.permission==='granted'&&state.registered}
