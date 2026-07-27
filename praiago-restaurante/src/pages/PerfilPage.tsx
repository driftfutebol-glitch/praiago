import { useCallback, useEffect, useState } from 'react'
import { Bell, CheckCircle2, ChevronRight, Clock, CreditCard, HelpCircle, Loader2, LogOut, MapPin, Navigation, Phone, Search, Send, Shield, Star, Store, TrendingUp, Wallet, XCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSessao, logout } from '../lib/auth'
import SuportePanel from '../components/SuportePanel'

type PerfilInfo = {
  nome: string
  avaliacao: number
  totalAvaliacoes: number
  telefone: string | null
  endereco: string | null
}

type SolicitacaoLocalizacao = {
  id: string
  status: 'pendente' | 'aprovada' | 'rejeitada' | 'utilizada' | 'cancelada'
  motivo: string
  observacao_admin: string | null
  solicitado_em: string
  revisado_em: string | null
  autorizado_ate: string | null
  utilizado_em: string | null
}

type PhotonFeature = {
  properties: {
    osm_id?: number
    osm_type?: string
    name?: string
    street?: string
    housenumber?: string
    district?: string
    locality?: string
    city?: string
    county?: string
    state?: string
    postcode?: string
  }
  geometry: {
    coordinates: [number, number]
  }
}

type EnderecoSelecionado = {
  rua: string
  bairro: string
  cidade: string
  estado: string
  cep: string
  lat: number
  lng: number
  origem: 'busca' | 'gps'
}

type Painel = 'notificacoes' | 'seguranca' | 'ajuda'

const CENTRO_PRAIA_GRANDE = { lat: -24.008, lng: -46.412 }

function enderecoDaFeature(feature: PhotonFeature, lat?: number, lng?: number): EnderecoSelecionado | null {
  const [featureLng, featureLat] = feature.geometry.coordinates
  const rua = feature.properties.street || feature.properties.name || ''
  const enderecoLat = lat ?? featureLat
  const enderecoLng = lng ?? featureLng
  if (!rua || !Number.isFinite(enderecoLat) || !Number.isFinite(enderecoLng)) return null

  return {
    rua,
    bairro: feature.properties.district || feature.properties.locality || '',
    cidade: feature.properties.city || feature.properties.county || 'Praia Grande',
    estado: feature.properties.state || 'Sao Paulo',
    cep: feature.properties.postcode || '',
    lat: enderecoLat,
    lng: enderecoLng,
    origem: lat != null && lng != null ? 'gps' : 'busca',
  }
}

function montarEndereco(endereco: EnderecoSelecionado, numero: string) {
  return [
    endereco.rua,
    numero,
    endereco.bairro,
    endereco.cidade,
    endereco.estado,
    endereco.cep,
  ].filter(Boolean).join(', ')
}

const painelConteudo: Record<Painel, { titulo: string; texto: string; itens: string[] }> = {
  notificacoes: {
    titulo: 'Notificacoes e alertas',
    texto: 'Os alertas de pedidos, avaliacoes e mudancas de status ficam ativos enquanto o painel estiver aberto.',
    itens: [
      'Pedidos novos aparecem no sino lateral.',
      'Avaliacoes recebidas entram no painel admin e no historico da loja.',
      'Quando o sinal cair, o mapa mostra o estado da conexao.',
    ],
  },
  seguranca: {
    titulo: 'Privacidade e seguranca',
    texto: 'Sua conta usa login por e-mail e senha. Se houver bloqueio administrativo, o acesso e encerrado automaticamente.',
    itens: [
      'Use um e-mail real e confirmado.',
      'Nao compartilhe a senha do restaurante.',
      'CNPJ e localizacao sao validados no cadastro.',
    ],
  },
  ajuda: {
    titulo: 'Central de ajuda PraiaGo',
    texto: 'Para suporte operacional, informe o nome da loja, e-mail da conta e o pedido afetado.',
    itens: [
      'Problemas com pedido: confira a aba Pedidos.',
      'Problemas com endereco: ajuste o ponto no mapa no cadastro.',
      'Problemas com acesso: solicite revisao ao administrador.',
    ],
  },
}

export default function PerfilPage() {
  const navigate = useNavigate()
  const sessao = getSessao()
  const [perfil, setPerfil] = useState<PerfilInfo>({
    nome: sessao?.nome || 'Meu Restaurante',
    avaliacao: 0,
    totalAvaliacoes: 0,
    telefone: null,
    endereco: null,
  })
  const [pedidosMes, setPedidosMes] = useState(0)
  const [faturamentoMes, setFaturamentoMes] = useState(0)
  const [painelAberto, setPainelAberto] = useState<Painel | null>(null)
  const [suporteAberto, setSuporteAberto] = useState(false)
  const [pixKey, setPixKey] = useState('')
  const [pixSalvando, setPixSalvando] = useState(false)
  const [pixMsg, setPixMsg] = useState('')
  const [horaAbre, setHoraAbre] = useState('')
  const [horaFecha, setHoraFecha] = useState('')
  const [salvandoHorario, setSalvandoHorario] = useState(false)
  const [horarioMsg, setHorarioMsg] = useState('')
  // O ponto da loja e fixo. Depois de definido, so muda com uma autorizacao
  // administrativa de uso unico.
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [salvandoLocal, setSalvandoLocal] = useState(false)
  const [localMsg, setLocalMsg] = useState('')
  const [solicitacaoLocal, setSolicitacaoLocal] = useState<SolicitacaoLocalizacao | null>(null)
  const [motivoCorrecao, setMotivoCorrecao] = useState('')
  const [novoEndereco, setNovoEndereco] = useState('')
  const [numeroEndereco, setNumeroEndereco] = useState('')
  const [sugestoesEndereco, setSugestoesEndereco] = useState<PhotonFeature[]>([])
  const [enderecoSelecionado, setEnderecoSelecionado] = useState<EnderecoSelecionado | null>(null)
  const [buscandoEndereco, setBuscandoEndereco] = useState(false)
  const [buscandoGps, setBuscandoGps] = useState(false)
  const [enviandoSolicitacao, setEnviandoSolicitacao] = useState(false)

  const carregarSolicitacaoLocal = useCallback(async () => {
    if (!sessao?.id) return
    const { data } = await supabase
      .from('solicitacoes_correcao_localizacao')
      .select('id,status,motivo,observacao_admin,solicitado_em,revisado_em,autorizado_ate,utilizado_em')
      .eq('restaurante_id', sessao.id)
      .order('solicitado_em', { ascending: false })
      .limit(1)
      .maybeSingle()
    setSolicitacaoLocal((data as SolicitacaoLocalizacao | null) ?? null)
  }, [sessao?.id])

  useEffect(() => {
    if (!sessao) return

    supabase
      .from('profiles')
      .select('nome, razao_social, avaliacao_media, total_avaliacoes, telefone_comercial, endereco, horario_abre, horario_fecha, lat, lng')
      .eq('id', sessao.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        setPerfil({
          nome: data.nome || data.razao_social || sessao.nome || 'Meu Restaurante',
          avaliacao: Number(data.avaliacao_media) || 0,
          totalAvaliacoes: Number(data.total_avaliacoes) || 0,
          telefone: data.telefone_comercial,
          endereco: data.endereco,
        })
        setHoraAbre(data.horario_abre || '')
        setHoraFecha(data.horario_fecha || '')
        setLat(data.lat != null ? Number(data.lat) : null)
        setLng(data.lng != null ? Number(data.lng) : null)
      })

    const inicioMes = new Date()
    inicioMes.setDate(1)
    inicioMes.setHours(0, 0, 0, 0)

    supabase
      .from('pedidos')
      .select('total, status')
      .eq('vendedor_id', sessao.id)
      .gte('created_at', inicioMes.toISOString())
      .then(({ data }) => {
        const entregues = (data ?? []).filter(p => p.status === 'entregue')
        setPedidosMes(entregues.length)
        setFaturamentoMes(entregues.reduce((a, p) => a + (Number(p.total) || 0), 0))
      })

    supabase
      .from('vendor_payment_accounts')
      .select('pix_key')
      .eq('vendedor_id', sessao.id)
      .maybeSingle()
      .then(({ data }) => setPixKey(data?.pix_key || ''))
  }, [sessao])

  useEffect(() => {
    if (!sessao?.id) return
    carregarSolicitacaoLocal()
    const channel = supabase
      .channel(`correcao_local_perfil_${sessao.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'solicitacoes_correcao_localizacao',
        filter: `restaurante_id=eq.${sessao.id}`,
      }, () => carregarSolicitacaoLocal())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessao?.id, carregarSolicitacaoLocal])

  useEffect(() => {
    const termo = novoEndereco.trim()
    if (solicitacaoLocal?.status !== 'aprovada' || termo.length < 3 || enderecoSelecionado?.rua === termo) {
      setBuscandoEndereco(false)
      setSugestoesEndereco([])
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setBuscandoEndereco(true)
      try {
        const url = new URL('https://photon.komoot.io/api/')
        url.searchParams.set('q', `${termo}, Praia Grande, Sao Paulo, Brasil`)
        url.searchParams.set('limit', '6')
        url.searchParams.set('lat', String(CENTRO_PRAIA_GRANDE.lat))
        url.searchParams.set('lon', String(CENTRO_PRAIA_GRANDE.lng))
        url.searchParams.set('zoom', '12')
        url.searchParams.set('location_bias_scale', '0.2')
        url.searchParams.append('layer', 'street')
        url.searchParams.append('layer', 'house')

        const resposta = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        })
        if (!resposta.ok) throw new Error('busca indisponivel')
        const data = (await resposta.json()) as { features?: PhotonFeature[] }
        const resultados = (data.features ?? []).filter(feature => {
          const cidade = `${feature.properties.city ?? ''} ${feature.properties.county ?? ''}`.toLowerCase()
          return cidade.includes('praia grande')
        })
        const unicos = resultados.filter((feature, index, lista) => {
          const chave = [
            feature.properties.street || feature.properties.name,
            feature.properties.district,
            feature.properties.postcode,
          ].join('|').toLowerCase()
          return lista.findIndex(item => [
            item.properties.street || item.properties.name,
            item.properties.district,
            item.properties.postcode,
          ].join('|').toLowerCase() === chave) === index
        })
        setSugestoesEndereco(unicos)
        if (!unicos.length) {
          setLocalMsg('Nenhuma rua encontrada em Praia Grande. Confira o nome e tente novamente.')
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setSugestoesEndereco([])
          setLocalMsg('Nao consegui buscar enderecos agora. Confira a internet e tente novamente.')
        }
      } finally {
        if (!controller.signal.aborted) setBuscandoEndereco(false)
      }
    }, 650)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [novoEndereco, solicitacaoLocal?.status, enderecoSelecionado?.rua])

  async function salvarHorario() {
    if (!sessao) return
    setSalvandoHorario(true)
    setHorarioMsg('')
    const { error } = await supabase
      .from('profiles')
      .update({ horario_abre: horaAbre || null, horario_fecha: horaFecha || null })
      .eq('id', sessao.id)
    setSalvandoHorario(false)
    setHorarioMsg(error ? 'Nao deu pra salvar. Tente de novo.' : 'Horario salvo! Ja aparece pros clientes.')
    setTimeout(() => setHorarioMsg(''), 3500)
  }

  async function solicitarCorrecaoLocalizacao() {
    if (!sessao) return
    const motivo = motivoCorrecao.trim()
    if (motivo.length < 8) {
      setLocalMsg('Explique em poucas palavras por que o ponto atual esta errado.')
      return
    }
    setEnviandoSolicitacao(true)
    setLocalMsg('')
    const { data, error } = await supabase.rpc('solicitar_correcao_localizacao', {
      p_motivo: motivo,
    })
    setEnviandoSolicitacao(false)
    if (error) {
      setLocalMsg(error.message.includes('Ja existe')
        ? 'Ja existe uma solicitacao aguardando analise.'
        : 'Nao foi possivel enviar a solicitacao. Tente novamente.')
      return
    }
    setSolicitacaoLocal(data as SolicitacaoLocalizacao)
    setMotivoCorrecao('')
    setLocalMsg('Solicitacao enviada ao painel PraiaGo. Voce sera avisado quando for revisada.')
  }

  function selecionarEndereco(feature: PhotonFeature) {
    const endereco = enderecoDaFeature(feature)
    if (!endereco) return
    setNovoEndereco(endereco.rua)
    setNumeroEndereco(feature.properties.housenumber || '')
    setEnderecoSelecionado(endereco)
    setSugestoesEndereco([])
    setLocalMsg('Rua selecionada. Agora informe somente o numero da loja.')
  }

  async function usarLocalizacaoAtual() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocalMsg('Seu aparelho nao tem GPS disponivel.')
      return
    }

    setBuscandoGps(true)
    setSugestoesEndereco([])
    setLocalMsg('Localizando a rua mais proxima...')

    try {
      const posicao = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        })
      })
      const gpsLat = posicao.coords.latitude
      const gpsLng = posicao.coords.longitude
      const url = new URL('https://photon.komoot.io/reverse')
      url.searchParams.set('lat', String(gpsLat))
      url.searchParams.set('lon', String(gpsLng))
      url.searchParams.set('limit', '5')
      url.searchParams.set('radius', '1')

      const resposta = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!resposta.ok) throw new Error('endereco indisponivel')
      const data = (await resposta.json()) as { features?: PhotonFeature[] }
      const feature = (data.features ?? []).find(item => item.properties.street || item.properties.name)
      const endereco = feature ? enderecoDaFeature(feature, gpsLat, gpsLng) : null
      if (!endereco) throw new Error('rua nao encontrada')

      setNovoEndereco(endereco.rua)
      setNumeroEndereco(feature?.properties.housenumber || '')
      setEnderecoSelecionado(endereco)
      setLocalMsg('Localizacao atual encontrada. Confira a rua e informe somente o numero.')
    } catch (error) {
      const codigo = (error as GeolocationPositionError).code
      setLocalMsg(codigo
        ? 'Precisamos da permissao de localizacao. Ative o GPS e permita o acesso.'
        : 'O GPS foi capturado, mas nao encontrei a rua. Digite o endereco para buscar.')
    } finally {
      setBuscandoGps(false)
    }
  }

  async function aplicarCorrecaoLocalizacao() {
    if (!sessao || !solicitacaoLocal || solicitacaoLocal.status !== 'aprovada') return
    if (!enderecoSelecionado) {
      setLocalMsg('Escolha um endereco da lista ou use sua localizacao atual.')
      return
    }
    const numero = numeroEndereco.trim()
    if (!numero) {
      setLocalMsg('Informe o numero da loja. Use S/N se o local nao tiver numero.')
      return
    }
    const endereco = montarEndereco(enderecoSelecionado, numero)
    setSalvandoLocal(true)
    setLocalMsg('Salvando o novo ponto fixo...')
    const { data, error } = await supabase.rpc('aplicar_correcao_localizacao', {
      p_solicitacao_id: solicitacaoLocal.id,
      p_lat: enderecoSelecionado.lat,
      p_lng: enderecoSelecionado.lng,
      p_endereco: endereco,
    })
    setSalvandoLocal(false)
    if (error) {
      setLocalMsg(error.message.includes('expirou')
        ? 'A autorizacao expirou. Envie uma nova solicitacao.'
        : 'Nao foi possivel corrigir o ponto. Tente novamente.')
      return
    }
    setLat(enderecoSelecionado.lat)
    setLng(enderecoSelecionado.lng)
    setPerfil(atual => ({ ...atual, endereco }))
    setSolicitacaoLocal(data as SolicitacaoLocalizacao)
    setLocalMsg('Localizacao corrigida e travada no novo ponto.')
    setTimeout(() => setLocalMsg(''), 6000)
  }

  async function salvarChavePix() {
    if (!sessao) return
    const chave = pixKey.trim()
    if (!chave) { setPixMsg('Digite sua chave Pix pra receber os repasses.'); return }
    setPixSalvando(true)
    setPixMsg('')
    const { error } = await supabase
      .from('vendor_payment_accounts')
      .upsert({ vendedor_id: sessao.id, pix_key: chave }, { onConflict: 'vendedor_id' })
    setPixSalvando(false)
    setPixMsg(error ? 'Nao deu pra salvar. Tente de novo.' : 'Chave Pix salva! O repasse cai nela.')
    setTimeout(() => setPixMsg(''), 4000)
  }

  function sair() {
    logout()
    navigate('/login')
  }

  const autorizacaoValida = solicitacaoLocal?.status === 'aprovada'
    && Boolean(solicitacaoLocal.autorizado_ate)
    && new Date(solicitacaoLocal.autorizado_ate as string).getTime() > Date.now()
  const aguardandoAnalise = solicitacaoLocal?.status === 'pendente'
  const localMsgSucesso = /(enviada|corrigida|selecionada|encontrada)/i.test(localMsg)
  const localMsgProcessando = localMsg.endsWith('...')

  return (
    <div style={{ padding: '32px 40px 48px', minHeight: '100vh' }}>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ fontSize: 38, fontWeight: 900, color: '#0f172a', margin: '0 0 8px', letterSpacing: -1 }}>Central do Restaurante</h1>
        <p style={{ fontSize: 15, color: '#64748b', margin: '0 0 32px', fontWeight: 600 }}>Gerencie seu perfil e configuracoes da conta</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel" style={{
        background: 'linear-gradient(135deg, rgba(249,115,22,0.16), rgba(255,255,255,0.92))',
        border: '1px solid rgba(249,115,22,0.25)',
        borderRadius: 24,
        padding: 32,
        marginBottom: 32,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{
            width: 88,
            height: 88,
            borderRadius: 24,
            background: '#fff7ed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(249,115,22,0.28)',
            boxShadow: '0 10px 24px rgba(249,115,22,0.16)',
          }}>
            <Store size={38} color="#f97316" />
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a' }}>{perfil.nome}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={pillStyle}>
                <MapPin size={14} color="#f97316" />
                {perfil.endereco || 'Endereco nao informado'}
              </span>
              <span style={pillStyle}>
                <Star size={14} color="#fbbf24" fill="#fbbf24" />
                {perfil.totalAvaliacoes > 0
                  ? `${perfil.avaliacao.toFixed(1)} · ${perfil.totalAvaliacoes} avaliacoes`
                  : 'Sem avaliacoes ainda'}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginBottom: 32 }}>
        <InfoCard title="Desempenho do mes" icon={<TrendingUp size={16} color="#16a34a" />}>
          <Metric label="Pedidos concluidos" value={String(pedidosMes)} color="#0f172a" />
          <Metric label="Faturamento bruto" value={`R$ ${faturamentoMes.toFixed(2).replace('.', ',')}`} color="#16a34a" />
        </InfoCard>

        <InfoCard title="Informacoes publicas" icon={<MapPin size={16} color="#0ea5e9" />}>
          <PublicInfo icon={<Phone size={18} color="#64748b" />} label="Telefone comercial" value={perfil.telefone || 'Adicione no cadastro'} />
          <PublicInfo icon={<MapPin size={18} color="#64748b" />} label="Endereco da base" value={perfil.endereco || 'Adicione no cadastro'} />
        </InfoCard>
      </div>

      <motion.button
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        onClick={() => navigate('/carteira')}
        className="glass-panel"
        style={{ width: '100%', borderRadius: 24, padding: 20, border: '1px solid rgba(0,0,0,0.06)', background: 'linear-gradient(135deg, rgba(14,165,233,0.08), rgba(34,197,94,0.08))', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', marginBottom: 4 }}
      >
        <div style={{ width: 46, height: 46, borderRadius: 14, background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Wallet size={22} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>Minha Carteira</div>
          <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 600 }}>Saldo, repasses e saque via Pix</div>
        </div>
        <ChevronRight size={20} color="#94a3b8" />
      </motion.button>

      <InfoCard title="Localizacao da loja (ponto fixo)" icon={<MapPin size={16} color="#f43f5e" />}>
        <p style={{ fontSize: 13, color: '#64748b', fontWeight: 500, margin: 0 }}>
          O restaurante nao se move: este ponto fica <strong>fixo</strong> no mapa. Para corrigir um ponto errado, envie uma solicitacao e aguarde a autorizacao PraiaGo.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: (lat != null && lng != null) ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${(lat != null && lng != null) ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}`, borderRadius: 14, padding: '12px 14px' }}>
          <MapPin size={18} color={(lat != null && lng != null) ? '#16a34a' : '#d97706'} />
          <div style={{ flex: 1, fontSize: 13, fontWeight: 800, color: (lat != null && lng != null) ? '#15803d' : '#b45309' }}>
            {(lat != null && lng != null)
              ? `Ponto fixo atual (${lat.toFixed(5)}, ${lng.toFixed(5)})`
              : 'Sem ponto definido — sua loja ainda nao aparece no mapa.'}
          </div>
          {lat != null && lng != null && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#0284c7', fontSize: 12, fontWeight: 900, textDecoration: 'none' }}
            >
              Ver mapa
            </a>
          )}
        </div>

        {aguardandoAnalise && solicitacaoLocal && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', border: '1px solid rgba(245,158,11,0.3)', background: '#fffbeb', borderRadius: 16, padding: 14 }}>
            <Clock size={20} color="#d97706" />
            <div>
              <div style={{ color: '#92400e', fontSize: 14, fontWeight: 900 }}>Aguardando aprovacao do admin</div>
              <div style={{ color: '#a16207', fontSize: 12, marginTop: 4, lineHeight: 1.45 }}>{solicitacaoLocal.motivo}</div>
            </div>
          </div>
        )}

        {autorizacaoValida && solicitacaoLocal && (
          <div style={{ display: 'grid', gap: 12, border: '1px solid rgba(34,197,94,0.3)', background: '#f0fdf4', borderRadius: 16, padding: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <CheckCircle2 size={20} color="#16a34a" />
              <div>
                <div style={{ color: '#166534', fontSize: 14, fontWeight: 900 }}>Correcao autorizada</div>
                <div style={{ color: '#15803d', fontSize: 12, marginTop: 2 }}>
                  Va ate a loja e grave o novo ponto ate {new Date(solicitacaoLocal.autorizado_ate as string).toLocaleDateString('pt-BR')}.
                </div>
              </div>
            </div>
            {solicitacaoLocal.observacao_admin && (
              <div style={{ color: '#166534', fontSize: 12, fontWeight: 700 }}>Admin: {solicitacaoLocal.observacao_admin}</div>
            )}
            <button
              type="button"
              onClick={usarLocalizacaoAtual}
              disabled={buscandoGps || salvandoLocal}
              style={{ width: '100%', border: '1px solid rgba(2,132,199,0.3)', background: '#eff6ff', color: '#0369a1', borderRadius: 12, padding: 12, fontSize: 13, fontWeight: 900, cursor: buscandoGps ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {buscandoGps ? <Loader2 size={17} className="animate-spin-slow" /> : <Navigation size={17} />}
              {buscandoGps ? 'Buscando rua proxima...' : 'Usar localizacao atual da loja'}
            </button>
            <div style={{ position: 'relative' }}>
              <label style={{ fontSize: 11, fontWeight: 900, color: '#166534' }}>
                RUA OU AVENIDA
                <div style={{ position: 'relative', marginTop: 6 }}>
                  <Search size={17} color="#64748b" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input
                    value={novoEndereco}
                    onChange={e => {
                      setNovoEndereco(e.target.value)
                      setEnderecoSelecionado(null)
                      setLocalMsg('')
                    }}
                    placeholder="Ex.: Rua Darcy"
                    autoComplete="off"
                    aria-autocomplete="list"
                    aria-expanded={sugestoesEndereco.length > 0}
                    style={{ display: 'block', width: '100%', boxSizing: 'border-box', border: '1px solid rgba(22,101,52,0.25)', borderRadius: 12, padding: '12px 42px 12px 38px', background: '#fff', color: '#0f172a', fontSize: 14, fontWeight: 700 }}
                  />
                  {buscandoEndereco && <Loader2 size={17} color="#16a34a" className="animate-spin-slow" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }} />}
                </div>
              </label>
              {sugestoesEndereco.length > 0 && (
                <div role="listbox" style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 6, overflow: 'hidden', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', boxShadow: '0 12px 28px rgba(15,23,42,0.16)' }}>
                  {sugestoesEndereco.map(feature => {
                    const rua = feature.properties.street || feature.properties.name || 'Endereco'
                    const detalhe = [feature.properties.district, feature.properties.city, feature.properties.postcode].filter(Boolean).join(' - ')
                    return (
                      <button
                        type="button"
                        role="option"
                        key={`${feature.properties.osm_type ?? 'osm'}-${feature.properties.osm_id ?? rua}-${detalhe}`}
                        onClick={() => selecionarEndereco(feature)}
                        style={{ width: '100%', border: 0, borderBottom: '1px solid #e2e8f0', background: '#fff', padding: '11px 12px', textAlign: 'left', cursor: 'pointer' }}
                      >
                        <span style={{ display: 'block', color: '#0f172a', fontSize: 13, fontWeight: 900 }}>{rua}</span>
                        {detalhe && <span style={{ display: 'block', marginTop: 3, color: '#64748b', fontSize: 11, fontWeight: 700 }}>{detalhe}</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <label style={{ fontSize: 11, fontWeight: 900, color: '#166534' }}>
              NUMERO
              <input
                value={numeroEndereco}
                onChange={e => setNumeroEndereco(e.target.value)}
                placeholder="Ex.: 123 ou S/N"
                inputMode="text"
                maxLength={20}
                style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, border: '1px solid rgba(22,101,52,0.25)', borderRadius: 12, padding: 12, background: '#fff', color: '#0f172a', fontSize: 14, fontWeight: 700 }}
              />
            </label>
            {enderecoSelecionado && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 10, background: '#fff', color: '#166534', fontSize: 12, fontWeight: 800, lineHeight: 1.45 }}>
                <MapPin size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{montarEndereco(enderecoSelecionado, numeroEndereco.trim() || 'numero pendente')}</span>
              </div>
            )}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" style={{ color: '#64748b', fontSize: 10, fontWeight: 700, textDecoration: 'none' }}>
              Enderecos: OpenStreetMap, busca Photon
            </a>
            <button
              type="button"
              onClick={aplicarCorrecaoLocalizacao}
              disabled={salvandoLocal || buscandoGps || !enderecoSelecionado || !numeroEndereco.trim()}
              style={{ width: '100%', border: 0, background: '#16a34a', color: '#fff', borderRadius: 14, padding: 14, fontSize: 14, fontWeight: 900, cursor: salvandoLocal ? 'wait' : 'pointer', opacity: !enderecoSelecionado || !numeroEndereco.trim() ? 0.55 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}
            >
              {salvandoLocal ? <Loader2 size={18} className="animate-spin-slow" /> : <MapPin size={18} />}
              {salvandoLocal ? 'Salvando ponto...' : 'Salvar endereco e ponto fixo'}
            </button>
          </div>
        )}

        {solicitacaoLocal?.status === 'rejeitada' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid rgba(239,68,68,0.25)', background: '#fef2f2', borderRadius: 16, padding: 14 }}>
            <XCircle size={20} color="#dc2626" />
            <div>
              <div style={{ color: '#991b1b', fontSize: 14, fontWeight: 900 }}>Solicitacao nao autorizada</div>
              <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 4 }}>{solicitacaoLocal.observacao_admin || 'Confira os dados e envie uma nova solicitacao.'}</div>
            </div>
          </div>
        )}

        {!aguardandoAnalise && !autorizacaoValida && (
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 900, color: '#64748b' }}>
              POR QUE O PONTO PRECISA SER CORRIGIDO?
              <textarea
                value={motivoCorrecao}
                onChange={e => setMotivoCorrecao(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Ex.: o ponto foi salvo no endereco vizinho durante o cadastro."
                style={{ display: 'block', width: '100%', boxSizing: 'border-box', resize: 'vertical', marginTop: 6, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: 12, background: '#f8fafc', color: '#0f172a', fontSize: 14, fontWeight: 650 }}
              />
            </label>
            <button
              type="button"
              onClick={solicitarCorrecaoLocalizacao}
              disabled={enviandoSolicitacao}
              style={{ width: '100%', border: '1px solid rgba(244,63,94,0.25)', background: '#fff1f2', color: '#e11d48', borderRadius: 14, padding: 14, fontSize: 14, fontWeight: 900, cursor: enviandoSolicitacao ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}
            >
              {enviandoSolicitacao ? <Loader2 size={18} className="animate-spin-slow" /> : <Send size={18} />}
              {enviandoSolicitacao ? 'Enviando...' : 'Solicitar correcao ao admin'}
            </button>
          </div>
        )}
        {localMsg && <div role="status" style={{ color: localMsgSucesso ? '#16a34a' : localMsgProcessando ? '#64748b' : '#ef4444', fontSize: 13, fontWeight: 800 }}>{localMsg}</div>}
      </InfoCard>

      <InfoCard title="Onde voce recebe (chave Pix)" icon={<CreditCard size={16} color="#0284c7" />}>
        <p style={{ fontSize: 13, color: '#64748b', fontWeight: 500, margin: 0 }}>
          Seus repasses caem nessa chave. Nao precisa criar conta em gateway nenhum — so informe sua chave Pix.
        </p>
        <div>
          <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>CHAVE PIX</label>
          <input
            value={pixKey}
            onChange={e => setPixKey(e.target.value)}
            placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatoria"
            style={{ width: '100%', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '12px', fontSize: 15, fontWeight: 700, color: '#0f172a', background: '#f8fafc' }}
          />
        </div>
        <button
          type="button"
          onClick={salvarChavePix}
          disabled={pixSalvando}
          style={{ width: '100%', border: '1px solid rgba(2,132,199,0.25)', background: '#eff6ff', color: '#0284c7', borderRadius: 16, padding: 16, fontSize: 14, fontWeight: 900, cursor: pixSalvando ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
        >
          {pixSalvando ? <Loader2 size={18} className="animate-spin-slow" /> : <CreditCard size={18} />}
          {pixSalvando ? 'Salvando...' : 'Salvar chave Pix'}
        </button>
        {pixMsg && <div style={{ color: pixMsg.includes('salva') ? '#16a34a' : '#ef4444', fontSize: 13, fontWeight: 800 }}>{pixMsg}</div>}
      </InfoCard>

      <InfoCard title="Horario de funcionamento" icon={<Clock size={16} color="#f97316" />}>
        <p style={{ fontSize: 13, color: '#64748b', fontWeight: 500, margin: 0 }}>
          Fora desse horario o restaurante aparece como <strong>fechado</strong> pros clientes no app.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>ABRE AS</label>
            <input type="time" value={horaAbre} onChange={e => setHoraAbre(e.target.value)} style={{ width: '100%', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '12px', fontSize: 16, fontWeight: 800, color: '#0f172a', background: '#f8fafc' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>FECHA AS</label>
            <input type="time" value={horaFecha} onChange={e => setHoraFecha(e.target.value)} style={{ width: '100%', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '12px', fontSize: 16, fontWeight: 800, color: '#0f172a', background: '#f8fafc' }} />
          </div>
        </div>
        <button
          type="button"
          onClick={salvarHorario}
          disabled={salvandoHorario}
          style={{ width: '100%', border: 'none', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', borderRadius: 16, padding: 15, fontSize: 14, fontWeight: 900, cursor: salvandoHorario ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
        >
          {salvandoHorario ? <Loader2 size={18} className="animate-spin-slow" /> : <Clock size={18} />}
          Salvar horario
        </button>
        {horarioMsg && <div style={{ fontSize: 13, fontWeight: 800, color: horarioMsg.includes('salvo') ? '#16a34a' : '#ef4444', textAlign: 'center' }}>{horarioMsg}</div>}
      </InfoCard>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel" style={{ borderRadius: 24, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.06)', marginBottom: 24 }}>
        {[
          { icon: Bell, label: 'Notificacoes e alertas', painel: 'notificacoes' as const },
          { icon: Shield, label: 'Privacidade e seguranca', painel: 'seguranca' as const },
          { icon: HelpCircle, label: 'Central de ajuda PraiaGo', painel: 'ajuda' as const },
        ].map(({ icon: Icon, label, painel }, i) => (
          <motion.button
            whileHover={{ backgroundColor: 'rgba(249,115,22,0.06)' }}
            whileTap={{ backgroundColor: 'rgba(249,115,22,0.1)' }}
            key={label}
            onClick={() => setPainelAberto(painelAberto === painel ? null : painel)}
            style={{
              width: '100%',
              background: painelAberto === painel ? '#fff7ed' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '20px 24px',
              borderTop: i > 0 ? '1px solid rgba(0,0,0,0.05)' : 'none',
              textAlign: 'left',
            }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 14, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0' }}>
              <Icon size={20} color={painelAberto === painel ? '#f97316' : '#64748b'} />
            </div>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 900, color: '#0f172a' }}>{label}</span>
            <ChevronRight size={18} color="#475569" />
          </motion.button>
        ))}
      </motion.div>

      {painelAberto && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel" style={{ borderRadius: 24, padding: 24, border: '1px solid rgba(249,115,22,0.18)', marginBottom: 24, background: '#ffffff' }}>
          <h2 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: 20, fontWeight: 900 }}>{painelConteudo[painelAberto].titulo}</h2>
          <p style={{ margin: '0 0 16px', color: '#475569', fontSize: 14, lineHeight: 1.6, fontWeight: 600 }}>{painelConteudo[painelAberto].texto}</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {painelConteudo[painelAberto].itens.map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#334155', fontSize: 13, fontWeight: 800 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: '#f97316', flexShrink: 0 }} />
                {item}
              </div>
            ))}
          </div>
          {painelAberto === 'ajuda' && (
            <button onClick={() => setSuporteAberto(true)} style={{ width: '100%', marginTop: 14, border: 0, background: 'linear-gradient(135deg,#f97316,#f59e0b)', color: '#fff', borderRadius: 14, padding: 14, fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>
              Falar com o suporte
            </button>
          )}
        </motion.div>
      )}

      <motion.button onClick={sair} whileHover={{ scale: 1.01, backgroundColor: 'rgba(239,68,68,0.08)' }} whileTap={{ scale: 0.98 }} style={{
        width: '100%',
        background: '#fff',
        border: '1px solid rgba(239,68,68,0.25)',
        borderRadius: 20,
        padding: 20,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
      }}>
        <LogOut size={20} color="#ef4444" />
        <span style={{ fontSize: 15, fontWeight: 900, color: '#ef4444', letterSpacing: 1 }}>ENCERRAR SESSAO</span>
      </motion.button>

      <AnimatePresence>
        {suporteAberto && sessao && (
          <SuportePanel
            onClose={() => setSuporteAberto(false)}
            usuarioId={sessao.id}
            usuarioNome={sessao.nome || 'Restaurante'}
            usuarioEmail={sessao.email || ''}
            plataforma="restaurante"
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function InfoCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="glass-panel" style={{ borderRadius: 24, padding: 24, border: '1px solid rgba(0,0,0,0.06)', background: '#ffffff' }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon} {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
    </motion.div>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: 16, borderRadius: 16, border: '1px solid #e2e8f0' }}>
      <span style={{ fontSize: 14, color: '#64748b', fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 900, color }}>{value}</span>
    </div>
  )
}

function PublicInfo({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', background: '#f8fafc', padding: 16, borderRadius: 16, border: '1px solid #e2e8f0' }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0' }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 800, letterSpacing: 0.4 }}>{label.toUpperCase()}</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{value}</div>
      </div>
    </div>
  )
}

const pillStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 14,
  color: '#334155',
  fontWeight: 700,
  background: '#ffffff',
  padding: '6px 12px',
  borderRadius: 12,
  border: '1px solid rgba(15,23,42,0.08)',
}
