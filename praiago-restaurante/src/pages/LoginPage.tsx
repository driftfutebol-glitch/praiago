import { useEffect, useState } from 'react'
import { CheckCircle2, Eye, EyeOff, Loader2, LogIn, MapPin, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { login } from '../lib/auth'
import { motion } from 'framer-motion'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

type EnderecoSugestao = {
  place_id: number
  display_name: string
  lat: string
  lon: string
  address?: {
    road?: string
    house_number?: string
    suburb?: string
    neighbourhood?: string
    city?: string
    town?: string
    postcode?: string
    state?: string
  }
}

function Recenter({ pos }: { pos: [number, number] }) {
  const map = useMap()
  useEffect(() => { map.setView(pos, 16) }, [map, pos])
  return null
}

function MapClickHandler({ onPick }: { onPick: (pos: [number, number]) => void }) {
  useMapEvents({
    click: (e) => onPick([e.latlng.lat, e.latlng.lng]),
  })
  return null
}

function AddressPreviewMap({ pos, onPick }: { pos: [number, number]; onPick: (pos: [number, number]) => void }) {
  return (
    <div style={{ height: 190, borderRadius: 18, overflow: 'hidden', border: '1px solid rgba(249,115,22,0.22)', marginTop: 12 }}>
      <MapContainer center={pos} zoom={16} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
        <Recenter pos={pos} />
        <MapClickHandler onPick={onPick} />
        <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" subdomains="abcd" />
        <Marker
          position={pos}
          draggable
          eventHandlers={{
            dragend: e => {
              const marker = e.target as L.Marker
              const p = marker.getLatLng()
              onPick([p.lat, p.lng])
            },
          }}
        />
      </MapContainer>
    </div>
  )
}

export default function LoginPage() {
  const [verSenha, setVerSenha] = useState(false)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const navigate = useNavigate()

  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)

  // Cadastro: dados reais do negócio
  const [nomePessoa, setNomePessoa] = useState('')
  const [nomeLoja, setNomeLoja] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [cnpjStatus, setCnpjStatus] = useState<'idle' | 'buscando' | 'ok' | 'invalido' | 'nao_encontrado' | 'duplicado'>('idle')
  const [razaoSocial, setRazaoSocial] = useState('')
  const [endereco, setEndereco] = useState('')
  const [numeroEndereco, setNumeroEndereco] = useState('')
  const [cepEndereco, setCepEndereco] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsMsg, setGpsMsg] = useState('')
  const [enderecoStatus, setEnderecoStatus] = useState<'idle' | 'buscando' | 'confirmado' | 'erro' | 'gps'>('idle')
  const [sugestoesEndereco, setSugestoesEndereco] = useState<EnderecoSugestao[]>([])
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checando' | 'ok' | 'invalido' | 'duplicado'>('idle')

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(async (event) => {
      if (event !== 'PASSWORD_RECOVERY') return
      const novaSenha = window.prompt('Digite a nova senha com pelo menos 6 caracteres:')
      if (!novaSenha || novaSenha.length < 6) {
        setErro('A nova senha precisa ter ao menos 6 caracteres.')
        return
      }
      const { error } = await supabase.auth.updateUser({ password: novaSenha })
      setErro(error ? `Nao foi possivel redefinir a senha: ${error.message}` : 'Senha redefinida com sucesso. Faca login novamente.')
    })
    return () => data.subscription.unsubscribe()
  }, [])

  function normalizarEmail(v = email) {
    return v.trim().toLowerCase()
  }

  function emailValido(v: string): boolean {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return false
    if (/\.\./.test(v) || v.endsWith('.')) return false
    const dominio = v.split('@')[1] || ''
    if (['teste.com', 'example.com', 'email.com', 'mailinator.com', 'tempmail.com'].includes(dominio)) return false
    const pedacos = dominio.split('.')
    return pedacos[pedacos.length - 1].length >= 2
  }

  async function emailJaCadastrado(valor = email) {
    const alvo = normalizarEmail(valor)
    if (!emailValido(alvo)) return false
    const { data } = await supabase.from('profiles').select('id').ilike('email', alvo).limit(1)
    return (data?.length ?? 0) > 0
  }

  async function checarEmail() {
    const alvo = normalizarEmail()
    if (!alvo) { setEmailStatus('idle'); return }
    if (!emailValido(alvo)) { setEmailStatus('invalido'); return }
    setEmailStatus('checando')
    setEmailStatus(await emailJaCadastrado(alvo) ? 'duplicado' : 'ok')
  }

  async function enviarResetSenha() {
    const alvo = normalizarEmail()
    if (!emailValido(alvo)) { setErro('Informe seu e-mail valido para redefinir a senha.'); return }
    const { error } = await supabase.auth.resetPasswordForEmail(alvo, { redirectTo: window.location.origin })
    setErro(error ? `Nao foi possivel enviar redefinicao: ${error.message}` : 'Enviamos o link de redefinicao para seu e-mail.')
  }

  async function reenviarVerificacao() {
    const alvo = normalizarEmail()
    if (!emailValido(alvo)) { setErro('Informe seu e-mail valido para reenviar a verificacao.'); return }
    const { error } = await supabase.auth.resend({ type: 'signup', email: alvo })
    setErro(error ? `Nao foi possivel reenviar verificacao: ${error.message}` : 'Enviamos um novo e-mail de verificacao.')
  }

  async function cnpjJaCadastrado(valor = cnpj) {
    const d = valor.replace(/\D/g, '')
    if (!d) return false
    const { data } = await supabase.from('profiles').select('id,nome').eq('cnpj', d).limit(1)
    return (data?.length ?? 0) > 0
  }

  // Validação local dos dígitos verificadores do CNPJ
  function cnpjValido(v: string): boolean {
    const d = v.replace(/\D/g, '')
    if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
    const calc = (len: number) => {
      const pesos = len === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2]
      const soma = pesos.reduce((a, p, i) => a + p * Number(d[i]), 0)
      const r = soma % 11
      return r < 2 ? 0 : 11 - r
    }
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
  }

  // Consulta pública (BrasilAPI) → preenche a razão social automaticamente
  async function buscarCNPJ() {
    const d = cnpj.replace(/\D/g, '')
    if (!d) { setCnpjStatus('idle'); return }
    if (!cnpjValido(d)) { setCnpjStatus('invalido'); setRazaoSocial(''); return }
    setCnpjStatus('buscando')
    try {
      if (await cnpjJaCadastrado(d)) {
        setCnpjStatus('duplicado')
        setRazaoSocial('')
        return
      }
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`)
      if (!r.ok) throw new Error('nao encontrado')
      const j = await r.json()
      const nome = j.nome_fantasia || j.razao_social || ''
      setRazaoSocial(j.razao_social || '')
      if (nome && !nomeLoja) setNomeLoja(nome)
      setCnpjStatus('ok')
    } catch {
      setCnpjStatus('nao_encontrado') // CNPJ com dígitos ok, mas sem cadastro público → pede o nome manual
    }
  }

  function usarMinhaLocalizacao() {
    if (!navigator.geolocation) {
      setGpsMsg('GPS nao disponivel neste dispositivo.')
      return
    }

    setGpsMsg('Buscando sua posicao...')
    setEnderecoStatus('buscando')
    navigator.geolocation.getCurrentPosition(
      p => {
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude })
        setGpsMsg('Localizacao capturada. Confira se o ponto esta na porta da loja.')
        setEnderecoStatus('gps')
        setSugestoesEndereco([])
      },
      () => {
        setGpsMsg('Nao consegui pegar o GPS. Digite o endereco e clique em verificar.')
        setEnderecoStatus('erro')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function verificarEndereco() {
    const rua = endereco.trim()
    if (rua.length < 4) {
      setErro('Digite pelo menos a rua ou avenida do restaurante.')
      return
    }
    if (!numeroEndereco.trim()) {
      setErro('Informe o numero do restaurante. Use S/N se o local nao tiver numero.')
      return
    }

    setErro('')
    setEnderecoStatus('buscando')
    setSugestoesEndereco([])
    setCoords(null)

    const cidadeBase = ['Praia Grande', 'Sao Paulo', 'Brasil']
    const consultas = [
      [rua, numeroEndereco.trim(), cepEndereco.replace(/\D/g, ''), ...cidadeBase].filter(Boolean),
      [rua, cepEndereco.replace(/\D/g, ''), ...cidadeBase].filter(Boolean),
      [rua, ...cidadeBase].filter(Boolean),
    ]

    try {
      let resultado: EnderecoSugestao[] = []
      for (const partes of consultas) {
        const url = new URL('/api/geocode/search', window.location.origin)
        url.searchParams.set('format', 'jsonv2')
        url.searchParams.set('addressdetails', '1')
        url.searchParams.set('limit', '5')
        url.searchParams.set('countrycodes', 'br')
        url.searchParams.set('q', partes.join(', '))

        const r = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
        if (!r.ok) throw new Error('consulta indisponivel')
        const data = (await r.json()) as EnderecoSugestao[]
        const praiaGrande = data.filter(item => {
          const texto = `${item.display_name} ${item.address?.city ?? ''} ${item.address?.town ?? ''}`.toLowerCase()
          return texto.includes('praia grande')
        })
        resultado = praiaGrande.length ? praiaGrande : data
        if (resultado.length) break
      }

      if (!resultado.length) {
        setEnderecoStatus('erro')
        setErro('Nao encontrei esse endereco. Tente informar rua, numero, bairro e CEP.')
        return
      }

      setSugestoesEndereco(resultado)
      setEnderecoStatus('idle')
    } catch {
      setEnderecoStatus('erro')
      setErro('Nao consegui verificar o endereco agora. Confira a internet e tente novamente.')
    }
  }

  function selecionarEndereco(item: EnderecoSugestao) {
    const lat = Number(item.lat)
    const lng = Number(item.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

    const bairro = item.address?.suburb || item.address?.neighbourhood
    const cidade = item.address?.city || item.address?.town || 'Praia Grande'
    const cep = item.address?.postcode || cepEndereco
    const rua = item.address?.road || endereco
    const numero = item.address?.house_number || numeroEndereco
    const enderecoFinal = [rua, numero, bairro, cidade, cep].filter(Boolean).join(', ')

    setEndereco(enderecoFinal || item.display_name)
    setNumeroEndereco(numero)
    setCepEndereco(cep)
    setCoords({ lat, lng })
    setEnderecoStatus('confirmado')
    setSugestoesEndereco([])
    setGpsMsg('Endereco verificado no mapa.')
  }

  function ajustarPontoMapa(pos: [number, number]) {
    setCoords({ lat: pos[0], lng: pos[1] })
    setEnderecoStatus('confirmado')
    setGpsMsg('Ponto ajustado manualmente no mapa.')
  }

  async function entrar() {
    const emailNormalizado = normalizarEmail()
    if (!emailValido(emailNormalizado)) { setErro('Informe um e-mail valido e real.'); setEmailStatus('invalido'); return }
    if (senha.length < 6) { setErro('A senha precisa ter ao menos 6 caracteres.'); return }
    setErro('')
    setLoading(true)

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: emailNormalizado, password: senha })
        if (error) {
          if (error.status === 429) throw new Error('Limite de tentativas excedido. Aguarde alguns minutos e tente novamente.')
          if (error.message.includes('Email not confirmed')) throw new Error('E-mail não confirmado! Verifique sua caixa de entrada.')
          if (error.message.includes('Invalid login credentials')) throw new Error('E-mail ou senha incorretos.')
          throw new Error('Erro ao fazer login. Verifique seus dados e sua conexão.')
        }
        
        if (data.user) {
          const { data: perfil } = await supabase
            .from('profiles')
            .select('status,ban_motivo,nome,email')
            .eq('id', data.user.id)
            .maybeSingle()

          if (perfil?.status === 'banido') {
            await supabase.auth.signOut()
            throw new Error(`Conta bloqueada pelo suporte.${perfil.ban_motivo ? ` Motivo: ${perfil.ban_motivo}` : ''}`)
          }

          login(data.user.id, emailNormalizado, perfil?.nome || undefined);
          navigate('/');
        }

      } else {
        // validações do cadastro real
        if (!nomePessoa.trim()) throw new Error('Informe o seu nome.')
        if (cnpj.trim() && cnpjStatus === 'invalido') throw new Error('CNPJ inválido — confira os números.')
        if (cnpj.trim() && cnpjStatus === 'duplicado') throw new Error('Este CNPJ ja esta cadastrado no PraiaGo.')
        if (cnpj.trim() && await cnpjJaCadastrado()) throw new Error('Este CNPJ ja esta cadastrado no PraiaGo.')
        if (await emailJaCadastrado(emailNormalizado)) throw new Error('Este e-mail ja esta cadastrado. Use login ou outro e-mail.')
        if (!nomeLoja.trim()) throw new Error('Informe o nome do restaurante ou loja.')
        if (!coords || (enderecoStatus !== 'confirmado' && enderecoStatus !== 'gps')) throw new Error('Verifique o endereco e selecione uma sugestao no mapa antes de cadastrar.')
        if (!endereco.trim() && !coords) throw new Error('Informe a localização da loja (endereço ou GPS).')

        const { data, error } = await supabase.auth.signUp({
          email: emailNormalizado,
          password: senha,
          options: { data: { role: 'restaurante', nome: nomeLoja.trim() } }
        })

        if (error) {
          if (error.status === 429) throw new Error('LIMITE EXCEDIDO (Erro 429). Para continuar testando, vá no painel Supabase -> Authentication -> Rate Limits -> e aumente o "Email Signups" para 1000.')
          throw new Error('Erro ao criar conta: ' + error.message)
        }

        if (data.user) {
          // o trigger já criou o profile — completamos com os dados do negócio
          await supabase.from('profiles').update({
            nome: nomeLoja.trim(),
            role: 'restaurante',
            email: emailNormalizado,
            cnpj: cnpj.replace(/\D/g, '') || null,
            razao_social: razaoSocial || nomePessoa.trim(),
            endereco: endereco.trim() || null,
            lat: coords?.lat ?? null,
            lng: coords?.lng ?? null,
            status: 'ativo',
          }).eq('id', data.user.id)
        }

        if (data.session && data.user && data.user.email_confirmed_at) {
          login(data.user.id, emailNormalizado);
          navigate('/');
          return;
        }

        if (data.user && !data.session) {
          setErro('Conta criada com sucesso! Enviamos um link de confirmação para o seu e-mail.')
          setIsLogin(true)
          setLoading(false)
          return
        }
      }

    } catch (err: any) {
      let msg = err.message || 'Erro inesperado.'
      if (msg.includes('Failed to fetch')) msg = 'Erro de conexão. Verifique sua internet.'
      if (msg.includes('kfxpzjqktbcsxlqapkyv')) msg = 'Erro interno do servidor. Tente novamente mais tarde.'
      setErro(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, position: 'relative', overflow: 'hidden' }}>
      {/* Efeito luminoso de fundo */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '80vw', height: '80vw', maxWidth: 800, maxHeight: 800,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(249,115,22,0.15) 0%, transparent 60%)',
        filter: 'blur(60px)', zIndex: 0, pointerEvents: 'none'
      }} />

      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }} style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }} style={{
            width: 80, height: 80, borderRadius: 24, margin: '0 auto 20px',
            background: 'linear-gradient(135deg, rgba(249,115,22,0.2), rgba(234,88,12,0.05))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40,
            border: '1px solid rgba(249,115,22,0.4)',
            boxShadow: '0 10px 30px rgba(249,115,22,0.3), inset 0 0 20px rgba(249,115,22,0.1)',
            backdropFilter: 'blur(10px)'
          }}>
            <span style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))' }}>🍽️</span>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#0f172a', textShadow: '0 0 30px rgba(0,0,0,0.08)', letterSpacing: -1 }}>PraiaGo</div>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 3, color: '#f97316', textTransform: 'uppercase', marginTop: 8, textShadow: '0 0 10px rgba(249,115,22,0.5)' }}>Central do Restaurante</div>
          </motion.div>
        </div>

        <div className="glass-panel" style={{ borderRadius: 28, padding: '40px 32px', border: '1px solid rgba(249,115,22,0.2)', boxShadow: '0 24px 48px rgba(0,0,0,0.4), inset 0 0 20px rgba(249,115,22,0.05)' }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>{isLogin ? 'Entrar no Sistema' : 'Criar Conta'}</h2>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 32, fontWeight: 500 }}>{isLogin ? 'Acesse sua central para gerenciar seu negócio' : 'Crie sua conta de Restaurante e gerencie pedidos'}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {!isLogin && (
              <>
                <div>
                  <label htmlFor="rest-nome" style={{ fontSize: 12, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 8, letterSpacing: 1 }}>SEU NOME</label>
                  <input id="rest-nome" value={nomePessoa} onChange={e => setNomePessoa(e.target.value)} placeholder="Maria da Silva" style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="rest-cnpj" style={{ fontSize: 12, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 8, letterSpacing: 1 }}>CNPJ (SE TIVER)</label>
                  <input id="rest-cnpj" value={cnpj} onChange={e => { setCnpj(e.target.value); setCnpjStatus('idle') }} onBlur={buscarCNPJ} placeholder="00.000.000/0000-00" style={inputStyle} />
                  {cnpjStatus === 'buscando' && <div style={{ fontSize: 12, color: '#0284c7', fontWeight: 700, marginTop: 6 }}>Consultando CNPJ…</div>}
                  {cnpjStatus === 'ok' && <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 700, marginTop: 6 }}>✓ CNPJ válido — {razaoSocial}</div>}
                  {cnpjStatus === 'invalido' && <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 700, marginTop: 6 }}>✕ CNPJ inválido, confira os números</div>}
                  {cnpjStatus === 'duplicado' && <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 700, marginTop: 6 }}>Este CNPJ ja esta cadastrado no PraiaGo.</div>}
                  {cnpjStatus === 'nao_encontrado' && <div style={{ fontSize: 12, color: '#d97706', fontWeight: 700, marginTop: 6 }}>CNPJ ok, mas não achei o cadastro — digite o nome da empresa abaixo</div>}
                </div>
                <div>
                  <label htmlFor="rest-loja" style={{ fontSize: 12, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 8, letterSpacing: 1 }}>NOME DO RESTAURANTE / LOJA</label>
                  <input id="rest-loja" value={nomeLoja} onChange={e => setNomeLoja(e.target.value)} placeholder="Quiosque da Praia" style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="rest-end" style={{ fontSize: 12, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 8, letterSpacing: 1 }}>LOCALIZAÇÃO DA LOJA</label>
                  <input id="rest-end" value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Av. Presidente Castelo Branco, 1000 - Boqueirão" style={inputStyle} />
                  <button onClick={usarMinhaLocalizacao} style={{ marginTop: 8, background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.3)', borderRadius: 12, padding: '10px 14px', color: '#0284c7', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                    📍 Usar minha localização (GPS)
                  </button>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                    <input value={numeroEndereco} onChange={e => { setNumeroEndereco(e.target.value); setEnderecoStatus('idle') }} placeholder="Numero" style={{ ...inputStyle, padding: '12px 14px', fontSize: 14 }} />
                    <input value={cepEndereco} onChange={e => { setCepEndereco(e.target.value); setEnderecoStatus('idle') }} placeholder="CEP" style={{ ...inputStyle, padding: '12px 14px', fontSize: 14 }} />
                  </div>
                  <button
                    type="button"
                    onClick={verificarEndereco}
                    disabled={enderecoStatus === 'buscando'}
                    style={{ marginTop: 10, width: '100%', background: enderecoStatus === 'confirmado' ? 'rgba(34,197,94,0.12)' : 'rgba(249,115,22,0.1)', border: `1px solid ${enderecoStatus === 'confirmado' ? 'rgba(34,197,94,0.35)' : 'rgba(249,115,22,0.28)'}`, borderRadius: 14, padding: '12px 14px', color: enderecoStatus === 'confirmado' ? '#16a34a' : '#ea580c', fontSize: 13, fontWeight: 900, cursor: enderecoStatus === 'buscando' ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    {enderecoStatus === 'buscando' ? <Loader2 size={16} className="animate-spin-slow" /> : enderecoStatus === 'confirmado' ? <CheckCircle2 size={16} /> : <Search size={16} />}
                    {enderecoStatus === 'confirmado' ? 'Endereco confirmado' : enderecoStatus === 'buscando' ? 'Verificando endereco...' : 'Verificar endereco no mapa'}
                  </button>
                  {sugestoesEndereco.length > 0 && (
                    <div style={{ marginTop: 10, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, overflow: 'hidden', background: '#fff' }}>
                      {sugestoesEndereco.map(item => (
                        <button
                          key={item.place_id}
                          type="button"
                          onClick={() => selecionarEndereco(item)}
                          style={{ width: '100%', border: 0, borderBottom: '1px solid #f1f5f9', background: '#fff', padding: '12px 14px', textAlign: 'left', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start' }}
                        >
                          <MapPin size={16} color="#f97316" style={{ marginTop: 2, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: '#334155', fontWeight: 700, lineHeight: 1.35 }}>{item.display_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {gpsMsg && <div style={{ fontSize: 12, color: coords ? '#16a34a' : '#64748b', fontWeight: 700, marginTop: 6 }}>{gpsMsg}</div>}
                  {coords && (
                    <>
                      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700, marginTop: 8 }}>Clique no mapa ou arraste o marcador para a porta correta do restaurante.</div>
                      <AddressPreviewMap pos={[coords.lat, coords.lng]} onPick={ajustarPontoMapa} />
                    </>
                  )}
                </div>
              </>
            )}
            <div>
              <label htmlFor="rest-email" style={{ fontSize: 12, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 8, letterSpacing: 1 }}>E-MAIL</label>
              <input
                id="rest-email"
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setEmailStatus('idle') }}
                placeholder="restaurante@exemplo.com"
                style={inputStyle}
                onFocus={(e) => e.target.style.border = '1px solid rgba(249,115,22,0.5)'}
                onBlur={(e) => { e.target.style.border = '1px solid rgba(0,0,0,0.08)'; checarEmail() }}
              />
              {emailStatus === 'checando' && <div style={{ fontSize: 12, color: '#0284c7', fontWeight: 700, marginTop: 6 }}>Verificando e-mail...</div>}
              {emailStatus === 'ok' && !isLogin && <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 700, marginTop: 6 }}>E-mail disponivel.</div>}
              {emailStatus === 'invalido' && <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 700, marginTop: 6 }}>Use um e-mail valido e real.</div>}
              {emailStatus === 'duplicado' && !isLogin && <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 700, marginTop: 6 }}>Este e-mail ja esta cadastrado.</div>}
            </div>
            <div>
              <label htmlFor="rest-senha" style={{ fontSize: 12, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 8, letterSpacing: 1 }}>SENHA</label>
              <div style={{ position: 'relative' }}>
                <input id="rest-senha" type={verSenha ? 'text' : 'password'} value={senha} onChange={e => setSenha(e.target.value)} onKeyDown={e => e.key === 'Enter' && entrar()} placeholder="••••••••" style={{ ...inputStyle, padding: '16px 48px 16px 20px' }} onFocus={(e) => e.target.style.border = '1px solid rgba(249,115,22,0.5)'} onBlur={(e) => e.target.style.border = '1px solid rgba(0,0,0,0.08)'} />
                <button aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVerSenha(!verSenha)} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}>
                  {verSenha ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {erro && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ fontSize: 13, color: erro.includes('sucesso') ? '#4ade80' : '#f87171', fontWeight: 600, background: erro.includes('sucesso') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: erro.includes('sucesso') ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(239,68,68,0.2)', padding: '10px 14px', borderRadius: 12 }}>{erro}</motion.div>}

            <motion.button disabled={loading} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={entrar} style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', border: 'none', borderRadius: 16, padding: '18px 0', color: '#fff', fontSize: 16, fontWeight: 900, letterSpacing: 1, cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 12, boxShadow: '0 8px 30px rgba(249,115,22,0.4)', textShadow: '0 1px 2px rgba(0,0,0,0.2)', opacity: loading ? 0.7 : 1 }}>
              <LogIn size={20} /> {loading ? 'AGUARDE...' : (isLogin ? 'ACESSAR PAINEL' : 'CADASTRAR')}
            </motion.button>
            
            <button onClick={() => { setIsLogin(!isLogin); setErro('') }} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: -4 }}>
              {isLogin ? 'Não tem conta? Crie uma aqui' : 'Já tem conta? Fazer Login'}
            </button>
            {isLogin && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginTop: -6 }}>
                <button type="button" onClick={enviarResetSenha} style={{ background: 'none', border: 0, color: '#0284c7', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Esqueci minha senha</button>
                <button type="button" onClick={reenviarVerificacao} style={{ background: 'none', border: 0, color: '#16a34a', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Reenviar verificacao</button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '16px 20px', borderRadius: 16,
  border: '1px solid rgba(0,0,0,0.08)', fontSize: 16, outline: 'none',
  color: '#0f172a', background: '#ffffff', boxSizing: 'border-box',
  transition: 'border 0.2s', fontFamily: 'inherit'
}
