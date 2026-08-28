import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import QRCode from 'qrcode'
import {
  UserRound, ShoppingBag, Store, LogOut, Check, AlertCircle, Copy, RotateCcw, QrCode,
} from 'lucide-react'
import { supabase, FUNCTIONS_URL } from './supabase'

type Papel = 'cliente' | 'ambulante' | 'restaurante'

const PAPEIS: { id: Papel; nome: string; icone: typeof UserRound; cor: string }[] = [
  { id: 'cliente', nome: 'Cliente', icone: UserRound, cor: '#0284c7' },
  { id: 'ambulante', nome: 'Ambulante', icone: ShoppingBag, cor: '#16a34a' },
  { id: 'restaurante', nome: 'Restaurante', icone: Store, cor: '#f97316' },
]

type Resultado = {
  email: string
  senha: string
  role: Papel
  ativacao_url: string
  qr: string
}

const VAZIO = {
  nome: '', email: '', telefone: '', cpf: '', cnpj: '',
  razao_social: '', licenca: '', endereco: '', categoria: '',
}

export default function Cadastro({ sessao }: { sessao: Session }) {
  const [papel, setPapel] = useState<Papel>('ambulante')
  const [form, setForm] = useState({ ...VAZIO })
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [copiado, setCopiado] = useState('')

  const cor = PAPEIS.find(p => p.id === papel)!.cor
  const set = (campo: keyof typeof VAZIO) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [campo]: e.target.value }))

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const r = await fetch(`${FUNCTIONS_URL}/cadastro-assistido`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessao.access_token}`,
        },
        body: JSON.stringify({ role: papel, ...form }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || 'Não foi possível cadastrar.')

      // QR gerado AQUI no navegador, não por serviço de internet: o Wi-Fi de
      // evento cai, e o cadastro não pode parar por causa de uma imagem.
      const qr = await QRCode.toDataURL(j.ativacao_url, { width: 320, margin: 1 })
      setResultado({ email: j.email, senha: j.senha, role: j.role, ativacao_url: j.ativacao_url, qr })
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha inesperada.')
    } finally {
      setEnviando(false)
    }
  }

  function copiar(texto: string, qual: string) {
    navigator.clipboard?.writeText(texto).then(() => {
      setCopiado(qual)
      setTimeout(() => setCopiado(''), 1800)
    }).catch(() => {})
  }

  function proximo() {
    setResultado(null)
    setForm({ ...VAZIO })
  }

  // ── Tela de entrega: o que a pessoa cadastrada precisa ver/levar ──
  if (resultado) {
    return (
      <div style={{ minHeight: '100vh', padding: 20, display: 'grid', placeItems: 'center' }}>
        <div style={{ ...cartao, maxWidth: 460, textAlign: 'center' }}>
          <div style={{ width: 54, height: 54, borderRadius: 18, background: '#dcfce7', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
            <Check size={28} color="#16a34a" strokeWidth={3} />
          </div>
          <h2 style={{ margin: 0, fontSize: 21, fontWeight: 900, letterSpacing: -0.5 }}>Cadastro feito!</h2>
          <p style={{ margin: '6px 0 18px', fontSize: 13.5, color: '#64748b', fontWeight: 600 }}>
            Peça pra pessoa apontar a câmera no código abaixo.
          </p>

          <img
            src={resultado.qr}
            alt="QR code de ativação"
            style={{ width: 240, height: 240, borderRadius: 16, border: '1px solid #e2e8f0' }}
          />

          <div style={{ marginTop: 16, padding: 14, borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0', textAlign: 'left' }}>
            <div style={{ fontSize: 10.5, fontWeight: 900, color: '#64748b', letterSpacing: 0.6 }}>E-MAIL</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 800, wordBreak: 'break-all' }}>{resultado.email}</span>
              <button onClick={() => copiar(resultado.email, 'email')} style={botaoCopiar}>
                {copiado === 'email' ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
              </button>
            </div>

            <div style={{ fontSize: 10.5, fontWeight: 900, color: '#64748b', letterSpacing: 0.6, marginTop: 12 }}>
              SENHA PROVISÓRIA
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: 1, fontFamily: 'ui-monospace, monospace' }}>
                {resultado.senha}
              </span>
              <button onClick={() => copiar(resultado.senha, 'senha')} style={botaoCopiar}>
                {copiado === 'senha' ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
              </button>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#b45309', fontWeight: 700, lineHeight: 1.4 }}>
              Só serve até a pessoa escolher a senha dela no QR. Depois disso, para de funcionar.
            </p>
          </div>

          <button onClick={proximo} style={{ ...botaoPrincipal, marginTop: 18, background: 'linear-gradient(100deg,#0284c7,#16a34a)' }}>
            <RotateCcw size={17} /> Próximo cadastro
          </button>
        </div>
      </div>
    )
  }

  // ── Formulário ──
  return (
    <div style={{ minHeight: '100vh', padding: '18px 16px 40px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.4, color: '#0284c7' }}>PRAIAGO</div>
            <h1 style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 900, letterSpacing: -0.6 }}>Cadastramento</h1>
          </div>
          <button onClick={() => supabase.auth.signOut()} style={{ ...botaoCopiar, width: 'auto', padding: '8px 12px', gap: 6, fontSize: 12.5, fontWeight: 800 }}>
            <LogOut size={15} /> Sair
          </button>
        </div>

        <form onSubmit={enviar} style={cartao}>
          <label style={rotulo}>TIPO DE CADASTRO</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 18 }}>
            {PAPEIS.map(p => {
              const Icone = p.icone
              const sel = papel === p.id
              return (
                <button
                  key={p.id} type="button" onClick={() => setPapel(p.id)}
                  style={{
                    padding: '13px 6px', borderRadius: 14, textAlign: 'center',
                    border: `1.5px solid ${sel ? p.cor : '#e2e8f0'}`,
                    background: sel ? `${p.cor}12` : '#fff',
                    color: sel ? p.cor : '#64748b', fontWeight: 900, fontSize: 12.5,
                  }}
                >
                  <Icone size={20} style={{ display: 'block', margin: '0 auto 5px' }} />
                  {p.nome}
                </button>
              )
            })}
          </div>

          <label style={rotulo}>NOME COMPLETO {papel !== 'cliente' && '/ NOME DA LOJA'}</label>
          <input value={form.nome} onChange={set('nome')} required style={campo} placeholder="Como aparece pro cliente" />

          <label style={{ ...rotulo, marginTop: 13 }}>E-MAIL</label>
          <input type="email" value={form.email} onChange={set('email')} required style={campo} placeholder="email@exemplo.com" />

          <label style={{ ...rotulo, marginTop: 13 }}>TELEFONE DE CONTATO</label>
          <input value={form.telefone} onChange={set('telefone')} inputMode="numeric" style={campo} placeholder="(13) 90000-0000" />

          {papel !== 'cliente' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 13 }}>
                <div>
                  <label style={rotulo}>CPF</label>
                  <input value={form.cpf} onChange={set('cpf')} inputMode="numeric" style={campo} placeholder="só números" />
                </div>
                <div>
                  <label style={rotulo}>CNPJ</label>
                  <input value={form.cnpj} onChange={set('cnpj')} inputMode="numeric" style={campo} placeholder="se tiver" />
                </div>
              </div>
              <p style={{ margin: '7px 0 0', fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
                Um dos dois basta. Sem CNPJ não tem problema.
              </p>
            </>
          )}

          {papel === 'ambulante' && (
            <>
              <label style={{ ...rotulo, marginTop: 13 }}>LICENÇA (OPCIONAL)</label>
              <input value={form.licenca} onChange={set('licenca')} style={campo} placeholder="Número da licença, se tiver" />
              <p style={{ margin: '7px 0 0', fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
                Quem não tem licença também pode se cadastrar.
              </p>
            </>
          )}

          {papel === 'restaurante' && (
            <>
              <label style={{ ...rotulo, marginTop: 13 }}>RAZÃO SOCIAL</label>
              <input value={form.razao_social} onChange={set('razao_social')} style={campo} placeholder="Do CNPJ — ou repita o nome da loja" />
              <label style={{ ...rotulo, marginTop: 13 }}>ENDEREÇO DA LOJA</label>
              <input value={form.endereco} onChange={set('endereco')} style={campo} placeholder="Rua, número, bairro, cidade" />
            </>
          )}

          {papel !== 'cliente' && (
            <>
              <label style={{ ...rotulo, marginTop: 13 }}>O QUE VENDE</label>
              <input value={form.categoria} onChange={set('categoria')} style={campo} placeholder="Ex.: milho, açaí, porções" />
            </>
          )}

          <div style={{ marginTop: 16, padding: 12, borderRadius: 13, background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', gap: 9 }}>
            <Check size={17} color="#16a34a" strokeWidth={3} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12.5, color: '#15803d', fontWeight: 700, lineHeight: 1.45 }}>
              Ao cadastrar, o KYC já sai <strong>liberado</strong> — a equipe conferiu documento e foto na hora.
            </span>
          </div>

          {erro && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, padding: '11px 12px', borderRadius: 12, background: '#fef2f2', color: '#b91c1c', fontSize: 13, fontWeight: 700 }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} /> {erro}
            </div>
          )}

          <button type="submit" disabled={enviando} style={{ ...botaoPrincipal, marginTop: 18, background: cor }}>
            <QrCode size={18} /> {enviando ? 'Cadastrando…' : 'Cadastrar e gerar QR'}
          </button>
        </form>
      </div>
    </div>
  )
}

const cartao: React.CSSProperties = {
  background: '#fff', borderRadius: 20, padding: 22,
  border: '1px solid #e2e8f0', boxShadow: '0 16px 40px -24px rgba(15,23,42,0.3)',
}

const rotulo: React.CSSProperties = {
  display: 'block', fontSize: 10.5, fontWeight: 900, letterSpacing: 0.8, color: '#64748b', marginBottom: 6,
}

const campo: React.CSSProperties = {
  width: '100%', height: 46, padding: '0 13px', borderRadius: 12,
  border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 600,
}

const botaoPrincipal: React.CSSProperties = {
  width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
  color: '#fff', fontSize: 15, fontWeight: 900,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
}

const botaoCopiar: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, borderRadius: 10, border: '1px solid #e2e8f0',
  background: '#fff', color: '#64748b', flexShrink: 0,
}
