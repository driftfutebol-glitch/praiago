import { useEffect, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Eye, EyeOff, ImagePlus, Loader2, LogIn, MapPin, Search, Store } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { login } from '../lib/auth'
import { alertDialog, promptDialog } from '../lib/dialog'
import { logSecurityEvent } from '../lib/securityAudit'
import { origemDoCadastro } from '../lib/origemCadastro'
import { motion } from 'framer-motion'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MAPA_TILES, MAPA_ATRIBUICAO, MAPA_ZOOM_MAX } from '../lib/mapa'
import { BUSINESS_CATEGORIES } from '../lib/businessCategories'
import { SELLER_PHOTO_BUCKET } from '../lib/sellerPhotos'

const SIGNUP_STEPS = ['Loja', 'Localização', 'Horários', 'Fotos', 'Conta'] as const
const SIGNUP_TITLES = ['Cadastre sua loja', 'Defina a localização', 'Escolha os horários', 'Adicione fotos', 'Crie sua conta'] as const
const WEEK_DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

type SignupDay = { dia: number; aberto: boolean; abre: string; fecha: string; vinte_quatro_horas: boolean }

function initialSignupHours(): SignupDay[] {
  return Array.from({ length: 7 }, (_, dia) => ({ dia, aberto: false, abre: '', fecha: '', vinte_quatro_horas: false }))
}

function legacyHours(days: SignupDay[]) {
  const today = new Date().getDay()
  const reference = days.find(day => day.dia === today && day.aberto)
    ?? days.find(day => day.aberto)
  return reference?.vinte_quatro_horas
    ? { horario_abre: '00:00', horario_fecha: '00:00' }
    : { horario_abre: reference?.abre ?? null, horario_fecha: reference?.fecha ?? null }
}

function validateSignupPhoto(file: File): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Use uma imagem JPG, PNG ou WebP.'
  if (file.size > 5 * 1024 * 1024) return 'Cada imagem deve ter no máximo 5 MB.'
  return null
}

function signupProfileFromMetadata(metadata: Record<string, unknown> | undefined) {
  if (metadata?.role !== 'restaurante') return null
  const nome = typeof metadata.nome === 'string' ? metadata.nome.trim() : ''
  const categoria = typeof metadata.categoria === 'string' ? metadata.categoria : ''
  const endereco = typeof metadata.endereco === 'string' ? metadata.endereco.trim() : ''
  const lat = metadata.lat
  const lng = metadata.lng
  const rawHours = Array.isArray(metadata.horarios) ? metadata.horarios : []
  const horarios: SignupDay[] = rawHours.map((entry: unknown) => {
    const day = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {}
    return {
      dia: Number(day.dia), aberto: day.aberto === true,
      abre: typeof day.abre === 'string' ? day.abre : '',
      fecha: typeof day.fecha === 'string' ? day.fecha : '',
      vinte_quatro_horas: day.vinte_quatro_horas === true,
    }
  })
  if (!nome || !BUSINESS_CATEGORIES.some(item => item === categoria) || !endereco || typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null
  if (horarios.length !== 7 || horarios.some((day, index) => day.dia !== index)) return null
  if (!horarios.some(day => day.aberto) || horarios.some(day => day.aberto && !day.vinte_quatro_horas && (!/^\d{2}:\d{2}$/.test(day.abre) || !/^\d{2}:\d{2}$/.test(day.fecha) || day.abre === day.fecha))) return null
  return {
    nome, role: 'restaurante', categoria, endereco, lat, lng,
    cnpj: typeof metadata.cnpj === 'string' && /^\d{14}$/.test(metadata.cnpj) ? metadata.cnpj : null,
    razao_social: typeof metadata.razao_social === 'string' ? metadata.razao_social : null,
    horarios: horarios.map(day => day.aberto
      ? day.vinte_quatro_horas
        ? { dia: day.dia, aberto: true, vinte_quatro_horas: true }
        : { dia: day.dia, aberto: true, abre: day.abre, fecha: day.fecha }
      : { dia: day.dia, aberto: false }),
    ...legacyHours(horarios),
  }
}

const restaurantLocationIcon = L.divIcon({
  className: '',
  iconSize: [46, 46],
  iconAnchor: [23, 23],
  html: `<div style="width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 8px 20px rgba(234,88,12,0.35)">${renderToStaticMarkup(<Store size={24} strokeWidth={2.6} />)}</div>`,
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
      <MapContainer center={pos} zoom={16} style={{ height: '100%', width: '100%' }} zoomControl={false}>
        <Recenter pos={pos} />
        <MapClickHandler onPick={onPick} />
        <TileLayer attribution={MAPA_ATRIBUICAO} url={MAPA_TILES} maxZoom={MAPA_ZOOM_MAX} />
        <Marker
          position={pos}
          icon={restaurantLocationIcon}
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
  // Aceite obrigatorio no cadastro (exigencia da Play Store + LGPD)
  const [aceitouTermos, setAceitouTermos] = useState(false)

  // Cadastro: dados reais do negócio
  const [nomePessoa, setNomePessoa] = useState('')
  const [nomeLoja, setNomeLoja] = useState('')
  const [categoriaNegocio, setCategoriaNegocio] = useState('Restaurante')
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
  const [signupStep, setSignupStep] = useState(0)
  const [signupHours, setSignupHours] = useState<SignupDay[]>(initialSignupHours)
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null)
  const [coverPhoto, setCoverPhoto] = useState<File | null>(null)
  const [profilePreview, setProfilePreview] = useState<string | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [pendingSignupUserId, setPendingSignupUserId] = useState<string | null>(null)

  useEffect(() => {
    if (!profilePhoto) { setProfilePreview(null); return }
    const url = URL.createObjectURL(profilePhoto)
    setProfilePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [profilePhoto])

  useEffect(() => {
    if (!coverPhoto) { setCoverPreview(null); return }
    const url = URL.createObjectURL(coverPhoto)
    setCoverPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [coverPhoto])

  function updateSignupDay(dia: number, patch: Partial<SignupDay>) {
    setSignupHours(current => current.map(day => day.dia === dia ? { ...day, ...patch } : day))
    setErro('')
  }

  function validateSignupStep(step: number): string | null {
    if (step === 0) {
      if (!nomeLoja.trim()) return 'Informe o nome da loja para continuar.'
      if (!BUSINESS_CATEGORIES.some(category => category === categoriaNegocio)) return 'Selecione o tipo de negócio.'
    }
    if (step === 1) {
      if (!coords || !['confirmado', 'gps'].includes(enderecoStatus)) return 'Confirme a localização no mapa antes de continuar.'
      if (!endereco.trim()) return 'Informe o endereço da loja.'
    }
    if (step === 2) {
      if (!signupHours.some(day => day.aberto)) return 'Selecione pelo menos um dia em que a loja funciona.'
      const invalid = signupHours.find(day => day.aberto && !day.vinte_quatro_horas && (!day.abre || !day.fecha || day.abre === day.fecha))
      if (invalid) return `Confira o horário de ${WEEK_DAYS[invalid.dia].toLowerCase()}. Informe abertura e fechamento diferentes ou marque 24h.`
    }
    return null
  }

  function advanceSignup() {
    const validationError = validateSignupStep(signupStep)
    if (validationError) { setErro(validationError); return }
    setErro('')
    setSignupStep(step => Math.min(step + 1, SIGNUP_STEPS.length - 1))
  }

  function chooseSignupPhoto(kind: 'perfil' | 'capa', file?: File) {
    if (!file) return
    const validationError = validateSignupPhoto(file)
    if (validationError) { setErro(validationError); return }
    setErro('')
    if (kind === 'perfil') setProfilePhoto(file)
    else setCoverPhoto(file)
  }

  async function uploadSignupPhoto(userId: string, kind: 'perfil' | 'capa', file: File) {
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${userId}/${kind}-${Date.now()}-${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from(SELLER_PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
    if (error) throw error
    const field = kind === 'perfil' ? 'foto_perfil_path' : 'foto_capa_path'
    const { error: profileError } = await supabase.from('profiles').update({ [field]: path }).eq('id', userId)
    if (profileError) {
      await supabase.storage.from(SELLER_PHOTO_BUCKET).remove([path])
      throw profileError
    }
  }

  async function confirmSignupEmail(userId: string) {
    const emailNormalizado = normalizarEmail()
    const { data: activeSession } = await supabase.auth.getUser()
    if (activeSession.user?.id !== userId) {
      const codigo = await promptDialog({ title: 'Confirme seu e-mail 📧', message: `Enviamos um código de 6 dígitos para ${emailNormalizado}. Digite para ativar sua loja.`, placeholder: '000000' })
      if (!codigo?.trim()) { setErro('Conta criada! Digite o código do e-mail para concluir o cadastro e enviar as fotos.'); return }
      const { data: otp, error: otpError } = await supabase.auth.verifyOtp({ email: emailNormalizado, token: codigo.trim(), type: 'signup' })
      if (otpError || !otp.user || otp.user.id !== userId) { setErro('Código inválido ou expirado. Solicite um novo código se precisar.'); return }
    }
    setLoading(true)
    try {
      const { error: profileError } = await supabase.from('profiles').update({
        nome: nomeLoja.trim(), role: 'restaurante', email: emailNormalizado, categoria: categoriaNegocio,
        cnpj: cnpj.replace(/\D/g, '') || null,
        razao_social: razaoSocial || nomePessoa.trim(),
        endereco: endereco.trim(), lat: coords?.lat ?? null, lng: coords?.lng ?? null,
        horarios: signupHours.map(day => day.aberto
          ? day.vinte_quatro_horas
            ? { dia: day.dia, aberto: true, vinte_quatro_horas: true }
            : { dia: day.dia, aberto: true, abre: day.abre, fecha: day.fecha }
          : { dia: day.dia, aberto: false }),
        ...legacyHours(signupHours),
      }).eq('id', userId)
      if (profileError) throw new Error('Conta confirmada, mas não foi possível salvar os dados da loja. Entre em contato com o suporte antes de vender.')
      const { data: perfil } = await supabase.from('profiles').select('role,status').eq('id', userId).maybeSingle()
      if (perfil?.role !== 'restaurante' || perfil?.status === 'banido') {
        await supabase.auth.signOut()
        throw new Error('Esta conta não pode acessar o painel de restaurante.')
      }
      let photoError = false
      for (const [kind, file] of [['perfil', profilePhoto], ['capa', coverPhoto]] as const) {
        if (!file) continue
        try { await uploadSignupPhoto(userId, kind, file) }
        catch { photoError = true }
      }
      login(userId, emailNormalizado, nomeLoja.trim())
      if (photoError) {
        await alertDialog({ title: 'Conta criada', message: 'A loja e os horários foram salvos, mas uma foto não terminou de enviar. Adicione-a em Perfil → Fotos públicas.' })
        navigate('/perfil')
      } else navigate('/')
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível confirmar a conta agora.')
    } finally {
      setLoading(false)
    }
  }

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

  async function checarEmail() {
    const alvo = normalizarEmail()
    if (!alvo) { setEmailStatus('idle'); return }
    if (!emailValido(alvo)) { setEmailStatus('invalido'); return }
    setEmailStatus('checando')
    setEmailStatus('ok')
  }

  async function enviarResetSenha() {
    const alvo = normalizarEmail()
    if (!emailValido(alvo)) { setErro('Informe seu e-mail valido para redefinir a senha.'); return }
    const { error } = await supabase.auth.resetPasswordForEmail(alvo, { redirectTo: window.location.origin })
    if (!error) await logSecurityEvent('password_reset_requested', alvo)
    setErro(error ? 'Nao foi possivel enviar a redefinicao agora. Tente de novo em instantes.' : 'Enviamos o e-mail de redefinicao. Use o link ou o codigo recebido.')
  }

  async function confirmarCodigoSenha() {
    const alvo = normalizarEmail()
    if (!emailValido(alvo)) { setErro('Informe seu e-mail valido para confirmar o codigo.'); return }
    const codigo = await promptDialog({ title: 'Código do e-mail', message: 'Digite o código que enviamos para o seu e-mail.', placeholder: '000000' })
    if (!codigo?.trim()) return
    const novaSenha = await promptDialog({ title: 'Nova senha', message: 'Use pelo menos 10 caracteres, com letras e numeros.', placeholder: 'Nova senha', secret: true })
    if (!novaSenha || novaSenha.length < 10 || !/[A-Za-z]/.test(novaSenha) || !/\d/.test(novaSenha)) { setErro('Use pelo menos 10 caracteres, com letras e numeros.'); return }

    const { error: otpError } = await supabase.auth.verifyOtp({ email: alvo, token: codigo.trim(), type: 'recovery' })
    if (otpError) { setErro('Codigo invalido ou expirado. Peca um novo codigo.'); return }
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    setErro(error ? 'Nao foi possivel trocar a senha. Peca um novo codigo e tente de novo.' : 'Senha alterada com sucesso. Entre novamente.')
    if (!error) await supabase.auth.signOut()
  }

  async function reenviarVerificacao() {
    const alvo = normalizarEmail()
    if (!emailValido(alvo)) { setErro('Informe seu e-mail valido para reenviar a verificacao.'); return }
    const { error } = await supabase.auth.resend({ type: 'signup', email: alvo })
    setErro(error ? 'Nao foi possivel reenviar agora. Aguarde um minuto e tente de novo.' : 'Enviamos um novo e-mail de verificacao.')
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

    try {
      // Uma consulta por clique: o serviço público de geocodificação tem
      // limite de uso. O número é preservado no endereço final e o dono
      // ajusta o marcador no mapa para indicar a porta exata.
      const url = new URL('/api/geocode/search', window.location.origin)
      url.searchParams.set('q', [rua, 'Praia Grande', 'São Paulo', 'Brasil'].join(', '))
      // O proxy do Vite usa estes parâmetros; em produção a função fixa os
      // mesmos valores no servidor e ignora parâmetros adicionais.
      url.searchParams.set('format', 'jsonv2')
      url.searchParams.set('addressdetails', '1')
      url.searchParams.set('limit', '5')
      url.searchParams.set('countrycodes', 'br')
      const r = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
      if (!r.ok) throw new Error('consulta indisponivel')
      const data = (await r.json()) as EnderecoSugestao[]
      const resultado = data.filter(item => {
        const texto = `${item.display_name} ${item.address?.city ?? ''} ${item.address?.town ?? ''}`.toLowerCase()
        return texto.includes('praia grande')
      })

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
    if (!isLogin && pendingSignupUserId) { await confirmSignupEmail(pendingSignupUserId); return }
    const emailNormalizado = normalizarEmail()
    if (!emailValido(emailNormalizado)) { setErro('Informe um e-mail valido e real.'); setEmailStatus('invalido'); return }
    if (senha.length < 6) { setErro('A senha precisa ter ao menos 6 caracteres.'); return }
    if (!isLogin && (senha.length < 10 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha))) { setErro('Use pelo menos 10 caracteres, com letras e numeros.'); return }
    setErro('')
    setLoading(true)

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: emailNormalizado, password: senha })
        if (error) {
          await logSecurityEvent('login_failed', emailNormalizado, { status: error.status ?? null, message: error.message })
          if (error.status === 429) throw new Error('Limite de tentativas excedido. Aguarde alguns minutos e tente novamente.')
          if (error.message.includes('Email not confirmed')) throw new Error('E-mail não confirmado! Verifique sua caixa de entrada.')
          if (error.message.includes('Invalid login credentials')) throw new Error('E-mail ou senha incorretos.')
          throw new Error('Erro ao fazer login. Verifique seus dados e sua conexão.')
        }
        
        if (data.user) {
          let { data: perfil } = await supabase
            .from('profiles')
            .select('status,ban_motivo,nome,email,role')
            .eq('id', data.user.id)
            .maybeSingle()

          // O link de confirmação pode ser aberto em outra aba. Nesse caso o
          // rascunho não está em memória, mas os campos não sensíveis da loja
          // estão nos metadados criados pelo fluxo de cadastro deste painel.
          if (perfil?.role === 'cliente' && perfil.status !== 'banido') {
            const draft = signupProfileFromMetadata(data.user.user_metadata)
            if (draft) {
              const { error: completionError } = await supabase.from('profiles').update(draft).eq('id', data.user.id)
              if (completionError) throw new Error('Seu e-mail foi confirmado, mas não consegui concluir a loja. Entre em contato com o suporte.')
              const refreshed = await supabase.from('profiles').select('status,ban_motivo,nome,email,role').eq('id', data.user.id).maybeSingle()
              perfil = refreshed.data
            }
          }

          if (perfil?.role !== 'restaurante') {
            await supabase.auth.signOut()
            await logSecurityEvent('access_denied', emailNormalizado, { reason: 'wrong_app_role', role: perfil?.role ?? null })
            throw new Error('Esta conta nao pertence ao painel de restaurante.')
          }
          if (perfil?.status === 'banido') {
            await supabase.auth.signOut()
            await logSecurityEvent('access_denied', emailNormalizado, { reason: 'banned', ban_motivo: perfil.ban_motivo ?? null })
            throw new Error(`Conta bloqueada pelo suporte.${perfil.ban_motivo ? ` Motivo: ${perfil.ban_motivo}` : ''}`)
          }

          await logSecurityEvent('login_success', emailNormalizado, { user_id: data.user.id })
          login(data.user.id, emailNormalizado, perfil?.nome || undefined);
          navigate('/');
        }

      } else {
        // validações do cadastro real
        for (let step = 0; step < SIGNUP_STEPS.length - 1; step++) {
          const validationError = validateSignupStep(step)
          if (validationError) { setSignupStep(step); throw new Error(validationError) }
        }
        if (!aceitouTermos) throw new Error('Você precisa aceitar os Termos de Uso e a Política de Privacidade.')
        if (!nomePessoa.trim()) throw new Error('Informe o seu nome.')
        if (cnpj.trim() && cnpjStatus === 'invalido') throw new Error('CNPJ inválido — confira os números.')
        if (!nomeLoja.trim()) throw new Error('Informe o nome do restaurante ou loja.')
        if (!coords || (enderecoStatus !== 'confirmado' && enderecoStatus !== 'gps')) throw new Error('Verifique o endereco e selecione uma sugestao no mapa antes de cadastrar.')
        if (!endereco.trim()) throw new Error('Informe o endereço da loja.')

        // Cadastro via edge function 'cadastro' (regra de 1 conta por IP).
        const { data, error } = await supabase.functions.invoke('cadastro', {
          body: {
            email: emailNormalizado, senha,
            metadata: {
              role: 'restaurante', nome: nomeLoja.trim(),
              categoria: categoriaNegocio,
              cnpj: cnpj.replace(/\D/g, '') || null,
              razao_social: razaoSocial || nomePessoa.trim(),
              endereco: endereco.trim() || null,
              lat: coords?.lat ?? null, lng: coords?.lng ?? null,
              horarios: signupHours.map(day => day.aberto
                ? day.vinte_quatro_horas
                  ? { dia: day.dia, aberto: true, vinte_quatro_horas: true }
                  : { dia: day.dia, aberto: true, abre: day.abre, fecha: day.fecha }
                : { dia: day.dia, aberto: false }),
            },
            emailRedirectTo: `${window.location.origin}/`,
            origem: origemDoCadastro(),
          },
        })
        if (error) {
          let msg = 'Erro ao criar conta. Tente novamente.'
          try { const p = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.(); if (p?.error) msg = p.error } catch { /* usa msg padrão */ }
          throw new Error(msg)
        }
        const resp = data as { error?: string; user_id?: string } | null
        if (resp?.error) throw new Error(resp.error)
        if (!resp?.user_id) throw new Error('Não foi possível identificar a conta criada. Tente novamente mais tarde.')
        await logSecurityEvent('signup_created', emailNormalizado, { email_confirmation_required: true })
        setPendingSignupUserId(resp.user_id)
        setLoading(false)
        await confirmSignupEmail(resp.user_id)
        return
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
    <div className="restaurant-login" style={{ minHeight: '100vh', background: '#eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, position: 'relative', overflow: 'hidden' }}>
      {/* Efeito luminoso de fundo */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '80vw', height: '80vw', maxWidth: 800, maxHeight: 800,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(249,115,22,0.15) 0%, transparent 60%)',
        filter: 'blur(60px)', zIndex: 0, pointerEvents: 'none'
      }} />

      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }} style={{ width: '100%', maxWidth: isLogin ? 420 : 560, position: 'relative', zIndex: 1 }}>
        <div className="restaurant-login-brand" style={{ textAlign: 'center', marginBottom: 40 }}>
          {/* Marca oficial, mesmo recorte do app do cliente (PNG quadrado com
              margem: a caixa recorta so o brasao). */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
            aria-label="PraiaGo"
            style={{ width: 200, height: 84, margin: '0 auto', overflow: 'hidden', position: 'relative' }}
          >
            <img
              src="/praiago-logo-transparent.png"
              alt="PraiaGo"
              style={{
                position: 'absolute', width: 330, height: 330, maxWidth: 'none',
                left: -80, top: -96, display: 'block',
              }}
            />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 3, color: '#f97316', textTransform: 'uppercase', marginTop: 10, textShadow: '0 0 10px rgba(249,115,22,0.5)' }}>Central do Restaurante</div>
          </motion.div>
        </div>

        <div className="glass-panel restaurant-login-card" style={{ borderRadius: 28, padding: '40px 32px', border: '1px solid rgba(249,115,22,0.2)', boxShadow: '0 24px 48px rgba(0,0,0,0.4), inset 0 0 20px rgba(249,115,22,0.05)' }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>{isLogin ? 'Entrar no Sistema' : SIGNUP_TITLES[signupStep]}</h2>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: isLogin ? 32 : 20, fontWeight: 500 }}>{isLogin ? 'Acesse sua central para gerenciar seu negócio' : 'Configure a vitrine antes de criar a conta.'}</p>

          {!isLogin && (
            <div aria-label="Etapas do cadastro" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 5, marginBottom: 24 }}>
              {SIGNUP_STEPS.map((label, index) => (
                <div key={label} aria-current={signupStep === index ? 'step' : undefined} style={{ minWidth: 0, textAlign: 'center' }}>
                  <div style={{ height: 5, borderRadius: 99, background: index <= signupStep ? '#f97316' : '#e2e8f0', marginBottom: 6 }} />
                  <span style={{ fontSize: 10, fontWeight: signupStep === index ? 900 : 700, color: signupStep === index ? '#c2410c' : '#64748b' }}>{label}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {!isLogin && signupStep === 0 && (
              <>
                <div>
                  <label htmlFor="rest-loja" style={{ fontSize: 12, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 8, letterSpacing: 1 }}>NOME DA LOJA</label>
                  <input id="rest-loja" value={nomeLoja} onChange={e => { setNomeLoja(e.target.value); setErro('') }} placeholder="Ex.: Minha Pizzaria" style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="rest-categoria" style={{ fontSize: 12, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 8, letterSpacing: 1 }}>TIPO DE NEGÓCIO</label>
                  <select id="rest-categoria" value={categoriaNegocio} onChange={e => { setCategoriaNegocio(e.target.value); setErro('') }} style={inputStyle}>
                    {BUSINESS_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
                  </select>
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
              </>
            )}
            {!isLogin && signupStep === 1 && (
              <div>
                  <label htmlFor="rest-end" style={{ fontSize: 12, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 8, letterSpacing: 1 }}>LOCALIZAÇÃO DA LOJA</label>
                  <input id="rest-end" value={endereco} onChange={e => { setEndereco(e.target.value); setEnderecoStatus(status => status === 'gps' ? status : 'idle') }} placeholder="Av. Presidente Castelo Branco, 1000 - Boqueirão" style={inputStyle} />
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
            )}
            {!isLogin && signupStep === 2 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#132238', fontWeight: 900, fontSize: 14 }}><Clock size={17} color="#f97316" /> Horário de funcionamento</div>
                  <button type="button" onClick={() => { const monday = signupHours[1]; setSignupHours(current => current.map(day => ({ ...day, aberto: monday.aberto, abre: monday.abre, fecha: monday.fecha, vinte_quatro_horas: monday.vinte_quatro_horas }))) }} style={{ border: '1px solid #e2e8f0', borderRadius: 9, background: '#fff', padding: '7px 8px', color: '#475569', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Repetir segunda</button>
                </div>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>Marque os dias em que a loja abre. Para fechar depois da meia-noite, por exemplo, use 22:00 às 04:00.</p>
                <div style={{ display: 'grid', gap: 8 }}>
                  {WEEK_ORDER.map(number => {
                    const day = signupHours[number]
                    return (
                      <div key={number} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 10, background: day.aberto ? '#fff' : '#f8fafc' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#132238', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                          <input type="checkbox" checked={day.aberto} onChange={event => updateSignupDay(number, { aberto: event.target.checked })} style={{ width: 17, height: 17, accentColor: '#f97316' }} />
                          {WEEK_DAYS[number]}
                        </label>
                        {day.aberto && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 9 }}>
                            {!day.vinte_quatro_horas && (
                              <>
                                <input aria-label={`${WEEK_DAYS[number]} abre`} type="time" value={day.abre} onChange={event => updateSignupDay(number, { abre: event.target.value })} style={signupTimeStyle} />
                                <span style={{ color: '#64748b', fontSize: 12 }}>às</span>
                                <input aria-label={`${WEEK_DAYS[number]} fecha`} type="time" value={day.fecha} onChange={event => updateSignupDay(number, { fecha: event.target.value })} style={signupTimeStyle} />
                              </>
                            )}
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto', fontSize: 12, color: '#475569', fontWeight: 800, cursor: 'pointer' }}>
                              <input type="checkbox" checked={day.vinte_quatro_horas} onChange={event => updateSignupDay(number, { vinte_quatro_horas: event.target.checked })} style={{ accentColor: '#16a34a' }} />24h
                            </label>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {!isLogin && signupStep === 3 && (
              <div style={{ display: 'grid', gap: 18 }}>
                <p style={{ margin: 0, color: '#64748b', fontSize: 12, lineHeight: 1.5 }}>Escolha imagens reais da sua loja. A foto do perfil deve ser quadrada; a capa fica melhor em 16:9. JPG, PNG ou WebP, até 5 MB cada. Você também pode adicionar depois.</p>
                {([
                  { kind: 'perfil' as const, label: 'Logo ou foto do perfil', file: profilePhoto, preview: profilePreview, ratio: '1 / 1' },
                  { kind: 'capa' as const, label: 'Banner da vitrine', file: coverPhoto, preview: coverPreview, ratio: '16 / 9' },
                ]).map(entry => (
                  <div key={entry.kind}>
                    <label htmlFor={`signup-${entry.kind}`} style={{ display: 'block', fontSize: 12, color: '#475569', fontWeight: 900, marginBottom: 8 }}>{entry.label}</label>
                    <label htmlFor={`signup-${entry.kind}`} style={{ display: 'grid', placeItems: 'center', width: entry.kind === 'perfil' ? 150 : '100%', maxWidth: entry.kind === 'perfil' ? 150 : 400, aspectRatio: entry.ratio, borderRadius: 14, border: '1px dashed #b9c8d6', background: '#f8fafc', overflow: 'hidden', cursor: 'pointer', color: '#f97316' }}>
                      {entry.preview ? <img src={entry.preview} alt={`Prévia de ${entry.label.toLowerCase()}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImagePlus size={25} />}
                    </label>
                    <input id={`signup-${entry.kind}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { chooseSignupPhoto(entry.kind, event.target.files?.[0]); event.target.value = '' }} style={{ width: '100%', marginTop: 7, fontSize: 12 }} />
                    {entry.file && <div style={{ color: '#148447', fontSize: 12, fontWeight: 800, marginTop: 5 }}>{entry.file.name}</div>}
                  </div>
                ))}
                <p style={{ margin: 0, color: '#64748b', fontSize: 11 }}>As fotos serão enviadas depois que você confirmar o e-mail. Mantenha esta página aberta até terminar.</p>
              </div>
            )}
            {(isLogin || signupStep === 4) && (
              <>
                {!isLogin && <div><label htmlFor="rest-nome" style={{ fontSize: 12, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 8, letterSpacing: 1 }}>SEU NOME</label><input id="rest-nome" value={nomePessoa} onChange={e => setNomePessoa(e.target.value)} disabled={!!pendingSignupUserId} placeholder="Maria da Silva" style={inputStyle} /></div>}
            <div>
              <label htmlFor="rest-email" style={{ fontSize: 12, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 8, letterSpacing: 1 }}>E-MAIL</label>
              <input
                id="rest-email"
                type="email"
                value={email}
                disabled={!isLogin && !!pendingSignupUserId}
                onChange={e => { setEmail(e.target.value); setEmailStatus('idle') }}
                placeholder="restaurante@exemplo.com"
                style={inputStyle}
                onFocus={(e) => e.target.style.border = '1px solid rgba(249,115,22,0.5)'}
                onBlur={(e) => { e.target.style.border = '1px solid rgba(0,0,0,0.08)'; checarEmail() }}
              />
              {emailStatus === 'checando' && <div style={{ fontSize: 12, color: '#0284c7', fontWeight: 700, marginTop: 6 }}>Verificando e-mail...</div>}
              {emailStatus === 'ok' && !isLogin && <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 700, marginTop: 6 }}>Formato de e-mail válido.</div>}
              {emailStatus === 'invalido' && <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 700, marginTop: 6 }}>Use um e-mail valido e real.</div>}
              {emailStatus === 'duplicado' && !isLogin && <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 700, marginTop: 6 }}>Este e-mail ja esta cadastrado.</div>}
            </div>
            <div>
              <label htmlFor="rest-senha" style={{ fontSize: 12, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 8, letterSpacing: 1 }}>SENHA</label>
              <div style={{ position: 'relative' }}>
                <input id="rest-senha" type={verSenha ? 'text' : 'password'} value={senha} disabled={!isLogin && !!pendingSignupUserId} onChange={e => setSenha(e.target.value)} onKeyDown={e => e.key === 'Enter' && entrar()} placeholder="••••••••" style={{ ...inputStyle, padding: '16px 48px 16px 20px' }} onFocus={(e) => e.target.style.border = '1px solid rgba(249,115,22,0.5)'} onBlur={(e) => e.target.style.border = '1px solid rgba(0,0,0,0.08)'} />
                <button aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVerSenha(!verSenha)} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}>
                  {verSenha ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {!isLogin && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', background: '#f8fafc', border: `1.5px solid ${aceitouTermos ? '#16a34a' : 'rgba(0,0,0,0.08)'}`, borderRadius: 14, padding: '12px 14px', transition: 'border-color .2s' }}>
                <input type="checkbox" checked={aceitouTermos} onChange={e => setAceitouTermos(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#16a34a', marginTop: 1, flexShrink: 0, cursor: 'pointer' }} />
                <span style={{ fontSize: 12.5, color: '#475569', fontWeight: 600, lineHeight: 1.5 }}>
                  Li e aceito os <a href="https://www.praiago.com.br/termos.html" target="_blank" rel="noopener noreferrer" style={{ color: '#0284c7', fontWeight: 800 }}>Termos de Uso</a> e a <a href="https://www.praiago.com.br/privacidade.html" target="_blank" rel="noopener noreferrer" style={{ color: '#0284c7', fontWeight: 800 }}>Política de Privacidade</a> — incluindo o uso da <strong>localização (GPS)</strong> durante os pedidos e o tratamento de nome, e-mail e dados de pagamento.
                </span>
              </label>
            )}
              </>
            )}
            {!isLogin && pendingSignupUserId && <p role="status" style={{ margin: 0, padding: 12, borderRadius: 12, background: '#fff7ed', color: '#9a3412', fontSize: 12, fontWeight: 700 }}>Sua conta já foi criada. Confirme o código recebido por e-mail para salvar o perfil completo e enviar as fotos. Não feche esta página.</p>}

            {erro && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ fontSize: 13, color: erro.includes('sucesso') ? '#4ade80' : '#f87171', fontWeight: 600, background: erro.includes('sucesso') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: erro.includes('sucesso') ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(239,68,68,0.2)', padding: '10px 14px', borderRadius: 12 }}>{erro}</motion.div>}

            {!isLogin && signupStep > 0 && !pendingSignupUserId && <button type="button" onClick={() => { setSignupStep(step => step - 1); setErro('') }} style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: 12, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer', fontWeight: 800 }}><ChevronLeft size={16} /> Voltar uma etapa</button>}
            <motion.button disabled={loading} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={isLogin || signupStep === SIGNUP_STEPS.length - 1 ? entrar : advanceSignup} style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', border: 'none', borderRadius: 16, padding: '18px 0', color: '#fff', fontSize: 16, fontWeight: 900, letterSpacing: 1, cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 12, boxShadow: '0 8px 30px rgba(249,115,22,0.4)', textShadow: '0 1px 2px rgba(0,0,0,0.2)', opacity: loading ? 0.7 : 1 }}>
              {isLogin || signupStep === SIGNUP_STEPS.length - 1 ? <LogIn size={20} /> : <ChevronRight size={20} />}
              {loading ? 'AGUARDE...' : isLogin ? 'ACESSAR PAINEL' : pendingSignupUserId ? 'CONFIRMAR E-MAIL' : signupStep === SIGNUP_STEPS.length - 1 ? 'CRIAR CONTA' : 'CONTINUAR'}
            </motion.button>
            
            <button onClick={() => { const nextLogin = !isLogin; setIsLogin(nextLogin); setSignupStep(!nextLogin && pendingSignupUserId ? 4 : 0); setErro('') }} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: -4 }}>
              {isLogin ? 'Não tem conta? Crie uma aqui' : 'Já tem conta? Fazer Login'}
            </button>
            {isLogin && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginTop: -6 }}>
                <button type="button" onClick={enviarResetSenha} style={{ background: 'none', border: 0, color: '#0284c7', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Esqueci minha senha</button>
                <button type="button" onClick={confirmarCodigoSenha} style={{ background: 'none', border: 0, color: '#7c3aed', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Tenho codigo</button>
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

const signupTimeStyle: React.CSSProperties = {
  minWidth: 116, padding: '9px 7px', borderRadius: 9,
  border: '1px solid #cbd5e1', color: '#132238', background: '#fff', fontSize: 13, fontWeight: 800,
}
