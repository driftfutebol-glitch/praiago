const profile={id:'00000000-0000-0000-0000-000000000001',nome:'Equipe QA',email:'qa@example.invalid',role:'sysadmin',status:'ativo',permissions:null}
const order={id:'00000000-0000-0000-0000-000000000002',created_at:new Date().toISOString(),status:'entregue',total:0,cliente_nome:'TESTE LOCAL DE INTERFACE — SEM PEDIDO REAL',zona:'QA',settlement_status:'pago'}
const ticket={id:'00000000-0000-0000-0000-000000000003',created_at:new Date().toISOString(),status:'aberto',prioridade:'baixa',plataforma:'cliente',usuario_nome:'TESTE LOCAL',assunto:'QA de cartão responsivo — sem chamado real',origem:'app',mensagem:'Somente interface de teste.'}
class Query {
  table:string;head=false;isSingle=false;writing=false
  constructor(table:string){this.table=table}
  select(_fields?:string,options?:{head?:boolean}){this.head=options?.head===true;return this}
  eq(){return this} neq(){return this} gte(){return this} lte(){return this} gt(){return this} lt(){return this} in(){return this} not(){return this} is(){return this} or(){return this} order(){return this} limit(){return this} range(){return this} ilike(){return this}
  maybeSingle(){this.isSingle=true;return this} single(){this.isSingle=true;return this}
  insert(){this.writing=true;return this} update(){this.writing=true;return this} delete(){this.writing=true;return this} upsert(){this.writing=true;return this}
  then(resolve:(value:unknown)=>unknown,reject?:(reason:unknown)=>unknown) {
    if(this.writing)return Promise.resolve({data:null,error:{message:'Escritas bloqueadas no QA local.'},count:null}).then(resolve,reject)
    const rows=this.table==='pedidos'?[order]:this.table==='tickets'?[ticket]:[]
    const value=this.isSingle?(this.table==='profiles'?profile:this.table==='signup_rules'?{um_por_ip:false,exigir_em_movel:false}:null):this.head?null:rows
    return Promise.resolve({data:value,count:this.head?0:rows.length,error:null}).then(resolve,reject)
  }
}
const channel={on(){return this},subscribe(){return this}}
export const supabase={
  from:(table:string)=>new Query(table),channel:()=>({...channel}),removeChannel:async()=>{},
  auth:{getUser:async()=>({data:{user:profile},error:null}),getSession:async()=>({data:{session:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null}),signInWithPassword:async()=>({data:{user:null},error:{message:'Login bloqueado no QA local'}}),resetPasswordForEmail:async()=>({error:{message:'QA local'}})},
  functions:{invoke:async(name:string)=>({data:name==='meu-ip'?{ip:'2001:db8::1'}:name==='admin-app-updates'?{ok:true,releases:[]}:[],error:null})},
  rpc:async()=>({data:null,error:null}),
  storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}}),createSignedUrl:async()=>({data:null,error:null}),list:async()=>({data:[],error:null})})}
}
export const VEIO_DE_RECOVERY=false
