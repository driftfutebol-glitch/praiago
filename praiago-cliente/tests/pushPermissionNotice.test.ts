import { afterEach,describe,expect,it,vi } from 'vitest'
import { installPushPermissionNotice,type PermissionBridge } from '../../mobile/push-permission-notice'
const stops:Array<()=>void>=[]
const host=()=>document.getElementById('praiago-push-permission-host')
function bridge(overrides:Partial<PermissionBridge>={}):PermissionBridge{
 return {platform:()=> 'android',available:()=>true,nativeVersion:async()=> '1.0.9',
  checkPermissions:vi.fn(async()=>({receive:'prompt'})),requestPermissions:vi.fn(async()=>({receive:'granted'})),...overrides}
}
afterEach(()=>{stops.splice(0).forEach(stop=>stop());host()?.remove();localStorage.clear();vi.restoreAllMocks()})
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve()}
function start(b:PermissionBridge,app:'cliente'|'ambulante'='cliente'){stops.push(installPushPermissionNotice(app,b));return b}
describe('OTA somente de permissão',()=>{
 it.each(['web','ios'])('não exibe em %s',async platform=>{
  const b=start(bridge({platform:()=>platform}));await settle();expect(host()).toBeNull();expect(b.requestPermissions).not.toHaveBeenCalled()
 })
 it('ignora APK sem plugin',async()=>{start(bridge({available:()=>false}));await settle();expect(host()).toBeNull()})
 it.each(['builtin','','1.1.0','1.0.8'])('ignora versão nativa %s',async version=>{
  start(bridge({nativeVersion:async()=>version}));await settle();expect(host()).toBeNull()
 })
 it('exibe somente no Ambulante histórico compatível',async()=>{
  start(bridge({nativeVersion:async()=> '1.0.4'}),'ambulante');await settle();expect(host()).not.toBeNull()
 })
 it('não abre a permissão automaticamente',async()=>{
  const b=start(bridge());await settle();expect(host()).not.toBeNull();expect(b.requestPermissions).not.toHaveBeenCalled()
  expect(host()!.shadowRoot!.textContent).toContain('autorizar agora não ativa o envio')
 })
 it('aceita permissão só no clique e nunca promete recebimento',async()=>{
  const b=start(bridge());await settle();host()!.shadowRoot!.querySelector<HTMLButtonElement>('.primary')!.click();await settle()
  expect(b.requestPermissions).toHaveBeenCalledTimes(1);expect(host()!.shadowRoot!.textContent).toContain('ainda dependem da próxima versão')
  expect(host()!.shadowRoot!.querySelector('.primary')).toBeNull()
 })
 it('rejeição não força configurações ou nova autorização',async()=>{
  const b=start(bridge({requestPermissions:vi.fn(async()=>({receive:'denied'}))}));await settle()
  host()!.shadowRoot!.querySelector<HTMLButtonElement>('.primary')!.click();await settle()
  expect(host()!.shadowRoot!.textContent).toContain('Permissão não autorizada');expect(b.requestPermissions).toHaveBeenCalledTimes(1)
 })
 it('falha na permissão não bloqueia o app',async()=>{
  start(bridge({requestPermissions:vi.fn(async()=>{throw new Error('bridge failure')})}));await settle()
  host()!.shadowRoot!.querySelector<HTMLButtonElement>('.primary')!.click();await settle()
  expect(host()!.shadowRoot!.textContent).toContain('continua funcionando normalmente')
 })
 it('não incomoda quem já autorizou',async()=>{
  start(bridge({checkPermissions:async()=>({receive:'granted'})}));await settle();expect(host()).toBeNull()
 })
 it('dispensa por 24 horas',async()=>{
  const b=start(bridge());await settle();host()!.shadowRoot!.querySelector<HTMLButtonElement>('nav button:last-child')!.click()
  expect(host()).toBeNull();start(b);await settle();expect(host()).toBeNull()
  expect(Number(localStorage.getItem('praiago:push-permission-dismiss:cliente:1.0.9'))).toBeGreaterThan(Date.now())
 })
 it('não duplica após verificações concorrentes',async()=>{
  start(bridge());start(bridge());await settle();expect(document.querySelectorAll('#praiago-push-permission-host')).toHaveLength(1)
 })
 it('bridge indisponível não deixa erro assíncrono escapar',async()=>{
  start(bridge({available:()=>{throw new Error('unavailable')}}));await settle();expect(host()).toBeNull()
 })
 it('cleanup antes de concluir não apresenta aviso',async()=>{
  let finish!:(version:string)=>void
  start(bridge({nativeVersion:()=>new Promise(resolve=>{finish=resolve})}));stops[0]();finish('1.0.9');await settle();expect(host()).toBeNull()
 })
})
