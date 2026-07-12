import { useEffect, useState } from 'react'
import { ShieldCheck, Plus, Trash2, Globe, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { confirmDialog, alertDialog } from '../lib/dialog'

type IpRow = { ip: string; descricao: string | null; created_at: string | null }

export default function IpsAutorizados() {
  const [ips, setIps] = useState<IpRow[]>([])
  const [umPorIp, setUmPorIp] = useState(true)
  const [novoIp, setNovoIp] = useState('')
  const [descricao, setDescricao] = useState('')
  const [meuIp, setMeuIp] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    const [{ data: rows }, { data: rule }] = await Promise.all([
      supabase.from('authorized_ips').select('ip,descricao,created_at').order('created_at', { ascending: false }),
      supabase.from('signup_rules').select('um_por_ip').eq('id', true).maybeSingle(),
    ])
    setIps((rows as IpRow[]) ?? [])
    setUmPorIp((rule as { um_por_ip?: boolean } | null)?.um_por_ip !== false)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    // best-effort: descobre o IP atual do admin pra facilitar autorizar
    fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => setMeuIp(d.ip || '')).catch(() => {})
  }, [])

  async function adicionar(ipAlvo?: string) {
    const ip = (ipAlvo || novoIp).trim()
    if (!ip) return
    setSalvando(true)
    const { data: user } = await supabase.auth.getUser()
    const { error } = await supabase.from('authorized_ips').insert({ ip, descricao: descricao.trim() || (ipAlvo ? 'Meu IP' : null), created_by: user.user?.id ?? null })
    setSalvando(false)
    if (error) { alertDialog({ title: 'Erro', message: error.message, tone: 'danger' }); return }
    setNovoIp(''); setDescricao(''); load()
  }

  async function remover(ip: string) {
    const ok = await confirmDialog({ title: 'Remover IP autorizado?', message: `${ip} volta a ser limitado a 1 conta.`, confirmText: 'Remover', tone: 'danger' })
    if (!ok) return
    const { error } = await supabase.from('authorized_ips').delete().eq('ip', ip)
    if (error) { alertDialog({ title: 'Erro', message: error.message, tone: 'danger' }); return }
    load()
  }

  async function toggleRegra() {
    const novo = !umPorIp
    setUmPorIp(novo)
    const { error } = await supabase.from('signup_rules').update({ um_por_ip: novo, updated_at: new Date().toISOString() }).eq('id', true)
    if (error) { setUmPorIp(!novo); alertDialog({ title: 'Erro', message: error.message, tone: 'danger' }) }
  }

  const jaAutorizado = meuIp && ips.some(i => i.ip === meuIp)

  return (
    <section className="glass-panel rounded-2xl border border-sky-500/20 p-5">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={18} className="text-sky-400" />
        <h2 className="text-lg font-black text-slate-100">Controle de contas por IP</h2>
      </div>
      <p className="text-sm text-slate-400 mb-4">Cliente, ambulante e restaurante: <b className="text-slate-200">1 conta por IP</b>. IPs autorizados aqui podem criar quantas quiserem.</p>

      {/* Toggle da regra */}
      <button onClick={toggleRegra} className="flex items-center gap-3 bg-slate-950/40 border border-slate-800 rounded-xl px-4 py-3 mb-4 w-full text-left hover:bg-slate-900/60">
        {umPorIp ? <ToggleRight size={26} className="text-green-400" /> : <ToggleLeft size={26} className="text-slate-500" />}
        <div>
          <div className="text-sm font-black text-slate-100">{umPorIp ? 'Regra ATIVA — 1 conta por IP' : 'Regra DESLIGADA — sem limite por IP'}</div>
          <div className="text-xs text-slate-500">Toque pra {umPorIp ? 'desligar' : 'ligar'}. (Redes móveis compartilham IP — cuidado ao ativar.)</div>
        </div>
      </button>

      {/* Meu IP */}
      {meuIp && (
        <div className="flex items-center justify-between gap-3 bg-slate-950/40 border border-slate-800 rounded-xl px-4 py-3 mb-4">
          <div className="flex items-center gap-2 text-sm text-slate-300"><Globe size={15} className="text-sky-400" /> Seu IP agora: <b className="font-mono text-slate-100">{meuIp}</b></div>
          {jaAutorizado
            ? <span className="text-xs font-bold text-green-400">✓ autorizado</span>
            : <button onClick={() => adicionar(meuIp)} disabled={salvando} className="text-xs font-black bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-lg px-3 py-1.5 hover:bg-sky-500/20">Autorizar meu IP</button>}
        </div>
      )}

      {/* Adicionar IP manual */}
      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <input value={novoIp} onChange={e => setNovoIp(e.target.value)} placeholder="IP (ex: 187.12.34.56)" className="flex-1 bg-slate-900/50 border border-slate-800 rounded-lg py-2.5 px-3 text-sm text-slate-200 outline-none focus:border-sky-500/40 font-mono" />
        <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição (ex: escritório)" className="flex-1 bg-slate-900/50 border border-slate-800 rounded-lg py-2.5 px-3 text-sm text-slate-200 outline-none focus:border-sky-500/40" />
        <button onClick={() => adicionar()} disabled={salvando || !novoIp.trim()} className="inline-flex items-center justify-center gap-1.5 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-lg px-4 py-2.5 text-sm font-black hover:bg-sky-500/20 disabled:opacity-50">
          {salvando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Autorizar
        </button>
      </div>

      {/* Lista */}
      {loading ? <div className="text-slate-500 text-sm">Carregando…</div>
        : ips.length === 0 ? <div className="text-slate-500 text-sm">Nenhum IP autorizado ainda.</div>
        : (
          <div className="space-y-2">
            {ips.map(i => (
              <div key={i.ip} className="flex items-center justify-between gap-3 bg-slate-950/40 rounded-xl px-4 py-3 border border-slate-800/50">
                <div>
                  <div className="text-slate-100 font-mono font-bold text-sm">{i.ip}</div>
                  <div className="text-xs text-slate-500">{i.descricao || 'sem descrição'}</div>
                </div>
                <button onClick={() => remover(i.ip)} className="text-red-400 hover:bg-red-500/10 rounded-lg p-2"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}
    </section>
  )
}
