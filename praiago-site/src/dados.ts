// Conteudo e configuracao do site num arquivo so — pra mexer em texto, link ou
// avaliacao sem precisar entrar em componente nenhum.

/* ─────────────────────────────────────────────────────────────
   LINKS — TROCAR AQUI QUANDO OS APPS SAIREM NA LOJA
   Enquanto `disponivel` for false, o botao mostra "em breve" em vez
   de levar pra um link quebrado. Quando publicar, e so por a URL da
   loja e virar a chave pra true.
   ───────────────────────────────────────────────────────────── */
export const LOJAS = {
  cliente: {
    play: '' as string,
    apple: '' as string,
    disponivel: false,
  },
  ambulante: {
    play: '' as string,
    apple: '' as string,
    disponivel: false,
  },
}

/** Painel do restaurante — roda no navegador, sem instalar nada.
 *  TROCAR pela URL nova da Vercel depois que o painel sair do dominio raiz. */
export const PAINEL_RESTAURANTE = 'https://praiago-restaurante.vercel.app'

export const CONTATO = {
  email: 'contato@praiago.com.br',
  instagram: 'https://instagram.com/praiago',
}

/* ── Numeros do hero ───────────────────────────────────────────
   De proposito NAO tem "X mil pedidos" nem "Y usuarios": o app ainda
   esta entrando no ar e numero de tracao inventado e o tipo de coisa
   que envelhece mal e da problema. Aqui so entra o que e fato do
   produto — e continua verdade amanha. */
export const NUMEROS = [
  { valor: '3', rotulo: 'apps numa praia só', detalhe: 'cliente, ambulante e restaurante' },
  { valor: 'PIX', rotulo: 'aprovado na hora', detalhe: 'e cartão de crédito também' },
  { valor: 'R$ 0', rotulo: 'pra começar a vender', detalhe: 'sem mensalidade, sem adesão' },
  { valor: '24h', rotulo: 'de atendimento', detalhe: 'assistente dentro do app' },
]

/* ── Passo a passo por perfil ───────────────────────────────── */
export type Passo = { titulo: string; texto: string }
export type Perfil = {
  id: 'cliente' | 'ambulante' | 'restaurante'
  nome: string
  chamada: string
  resumo: string
  cor: string
  corClara: string
  emoji: string
  passos: Passo[]
  acao: { texto: string; tipo: 'download' | 'link' }
}

export const PERFIS: Perfil[] = [
  {
    id: 'cliente',
    nome: 'Pra quem tá na praia',
    chamada: 'Não levanta do guarda-sol.',
    resumo:
      'Você abre o app e vê o que dá pra pedir de onde você está: ambulante passando perto, restaurante que entrega na areia, loja e até ingresso de evento.',
    cor: '#0ea5e9',
    corClara: '#e0f2fe',
    emoji: '🏖️',
    passos: [
      {
        titulo: 'Abre e vê o que tem perto',
        texto:
          'O app pega sua localização e mostra quem está por perto de verdade: ambulantes ao vivo no mapa, restaurantes que entregam na sua faixa de areia, lojas e eventos da região.',
      },
      {
        titulo: 'Monta o pedido',
        texto:
          'Cardápio com foto e preço, do jeito que você já conhece. Dá pra juntar tudo num carrinho só e aplicar cupom antes de fechar.',
      },
      {
        titulo: 'Paga pelo app',
        texto:
          'PIX aprovado na hora ou cartão de crédito. Você vê exatamente quanto vai pagar antes de confirmar — taxa, entrega e total, sem surpresa depois.',
      },
      {
        titulo: 'Recebe onde você está',
        texto:
          'Acompanha o pedido saindo e o ambulante chegando no mapa. Quando ele encosta, é só pegar. Sem fila, sem procurar carteira, sem trocado.',
      },
    ],
    acao: { texto: 'Baixar o app PraiaGo', tipo: 'download' },
  },
  {
    id: 'ambulante',
    nome: 'Pra quem vende na areia',
    chamada: 'A praia inteira vê sua banca.',
    resumo:
      'Enquanto você anda com o isopor, quem está deitado na areia te encontra no mapa e chama. Você só entrega e recebe.',
    cor: '#22c55e',
    corClara: '#dcfce7',
    emoji: '🥥',
    passos: [
      {
        titulo: 'Cadastra a banca pelo celular',
        texto:
          'Foto, nome, o que você vende e quanto custa. Leva alguns minutos e não precisa de computador nem de CNPJ pra começar.',
      },
      {
        titulo: 'Fica online',
        texto:
          'Ao ficar online, você aparece no radar de todo mundo que está na praia perto de você. Ficou sem estoque ou foi embora? Fica offline e some do mapa.',
      },
      {
        titulo: 'Recebe o pedido no celular',
        texto:
          'Chega notificação com o que a pessoa quer e onde ela está. Você aceita e o app te mostra o caminho até o guarda-sol.',
      },
      {
        titulo: 'Pede o saque quando quiser',
        texto:
          'O cliente já pagou no app — você não mexe com trocado nem com maquininha. Você cadastra seu banco, agência e conta uma vez; o valor da venda libera em 7 dias e é só pedir o saque pra cair na sua conta, com a menor taxa do mercado.',
      },
    ],
    acao: { texto: 'Baixar o app do ambulante', tipo: 'download' },
  },
  {
    id: 'restaurante',
    nome: 'Pra restaurante e quiosque',
    chamada: 'É site, não é aplicativo.',
    resumo:
      'O restaurante não baixa app nenhum: é um site de gestão que abre no navegador do computador, do notebook ou do tablet do caixa. De lá você vende online, controla o cardápio, acompanha os pedidos ao vivo e vê o dinheiro entrando — tudo na mesma tela.',
    cor: '#f59e0b',
    corClara: '#fef3c7',
    emoji: '🍽️',
    passos: [
      {
        titulo: 'Entra pelo navegador, sem instalar nada',
        texto:
          'Cadastro e acesso pelo site — nenhum aplicativo pra baixar, nada ocupando espaço na máquina. Funciona no computador do caixa, no notebook e no tablet, sempre a mesma tela.',
      },
      {
        titulo: 'Abre a loja e monta o cardápio',
        texto:
          'Você liga a chave "aberto" quando começa a atender e define pratos, preços, horário e até onde entrega. Acabou um item? Pausa ele sem tirar do cardápio.',
      },
      {
        titulo: 'Vende online e gerencia na tela',
        texto:
          'O pedido cai no painel em tempo real: você aceita, marca em preparo e depois saindo pra entrega, e acompanha os entregadores no mapa. O cliente vê cada passo pelo app.',
      },
      {
        titulo: 'Acompanha e saca o que vendeu',
        texto:
          'Você cadastra banco, agência e conta do restaurante uma vez. O painel mostra o que já entrou, o que ainda está pra liberar e a data de cada valor — repasse em 7 dias, e o saque cai na conta cadastrada.',
      },
    ],
    acao: { texto: 'Abrir o painel do restaurante', tipo: 'link' },
  },
]

/* ── Recursos ───────────────────────────────────────────────── */
export const RECURSOS = [
  {
    icone: 'radar',
    titulo: 'Radar ao vivo',
    texto: 'Os ambulantes online aparecem no mapa em tempo real, com a distância e quanto tempo dá a pé.',
    cor: '#0ea5e9',
  },
  {
    icone: 'pix',
    titulo: 'PIX e cartão',
    texto: 'Pagamento dentro do app, aprovado na hora. Sem trocado, sem maquininha e sem sair do lugar.',
    cor: '#22c55e',
  },
  {
    icone: 'cupom',
    titulo: 'Cupons e promoções',
    texto: 'Descontos do próprio estabelecimento aplicados na hora de fechar o carrinho.',
    cor: '#a855f7',
  },
  {
    icone: 'evento',
    titulo: 'Eventos e ingressos',
    texto: 'O que vai rolar na praia, com ingresso comprado pelo app e QR Code direto no celular.',
    cor: '#f43f5e',
  },
  {
    icone: 'carteira',
    titulo: 'Saque na sua conta',
    texto: 'Cadastra banco, agência e conta, e pede o saque pela tela. Repasse em 7 dias, com a menor taxa do mercado.',
    cor: '#f59e0b',
  },
  {
    icone: 'chat',
    titulo: 'Atendimento 24h',
    texto: 'Assistente dentro do app pra tirar dúvida e resolver problema de pedido a qualquer hora.',
    cor: '#14b8a6',
  },
  {
    icone: 'loja',
    titulo: 'Lojas da região',
    texto: 'Não é só comida: quiosque, loja de praia e mercadinho também entram no app.',
    cor: '#6366f1',
  },
  {
    icone: 'escudo',
    titulo: 'Cadastro verificado',
    texto: 'Quem vende passa por conferência de documento antes de aparecer pra você.',
    cor: '#0f766e',
  },
]

/* ─────────────────────────────────────────────────────────────
   AVALIAÇÕES — ⚠️ CONTEÚDO DE EXEMPLO, NÃO SÃO CLIENTES REAIS
   Foram escritas pra preencher o layout enquanto o app não tem
   avaliação de verdade. Trocar pelas reais assim que existirem:
   depoimento inventado apresentado como real é propaganda enganosa
   (CDC art. 37) e derruba ficha na Play Store se alguém reportar.
   ───────────────────────────────────────────────────────────── */
export type Avaliacao = {
  nome: string
  papel: string
  local: string
  nota: number
  texto: string
}

export const AVALIACOES: Avaliacao[] = [
  {
    nome: 'Camila R.',
    papel: 'Cliente',
    local: 'Praia Grande, SP',
    nota: 5,
    texto:
      'Domingo lotado, eu com criança pequena no guarda-sol. Pedi açaí e água pelo app e chegou em 10 minutos. Não precisei levantar nenhuma vez.',
  },
  {
    nome: 'Seu Ademir',
    papel: 'Ambulante',
    local: 'Boqueirão',
    nota: 5,
    texto:
      'Trinta anos andando na areia gritando. Hoje o povo me chama pelo celular. Ando menos e vendo mais, isso pra mim já valeu.',
  },
  {
    nome: 'Thiago M.',
    papel: 'Cliente',
    local: 'Guarujá, SP',
    nota: 5,
    texto:
      'O mapa mostrando o cara do milho chegando é sensacional. Dá pra ver ele vindo. Meu filho ficou acompanhando a bolinha andar na tela.',
  },
  {
    nome: 'Quiosque Maré Alta',
    papel: 'Restaurante',
    local: 'Praia Grande, SP',
    nota: 5,
    texto:
      'O painel abre no computador do caixa e pronto. A menina que atende aprendeu a mexer no mesmo dia, sem ninguém treinar ela.',
  },
  {
    nome: 'Juliana P.',
    papel: 'Cliente',
    local: 'Santos, SP',
    nota: 5,
    texto:
      'Paguei no PIX e caiu na hora. O que eu mais gosto é ver o valor certinho antes de confirmar, sem taxa aparecendo de surpresa no fim.',
  },
  {
    nome: 'Marcos V.',
    papel: 'Ambulante',
    local: 'Aviação',
    nota: 5,
    texto:
      'Não carrego mais trocado e não perco venda por falta de maquininha. Cadastrei meu banco uma vez e agora peço o saque pelo celular quando o valor libera.',
  },
  {
    nome: 'Renata L.',
    papel: 'Cliente',
    local: 'Praia Grande, SP',
    nota: 5,
    texto:
      'Estava com preguiça de andar até o quiosque com o sol a pino. Pedi porção e cerveja, chegou gelada na areia. Virou rotina de domingo.',
  },
  {
    nome: 'Pousada Mar Aberto',
    papel: 'Restaurante',
    local: 'Mongaguá, SP',
    nota: 4,
    texto:
      'A parte de pausar item que acabou salvou a gente. Antes o cliente pedia e a gente tinha que ligar avisando que não tinha.',
  },
  {
    nome: 'Bruno S.',
    papel: 'Cliente',
    local: 'Praia Grande, SP',
    nota: 5,
    texto:
      'Comprei ingresso de um evento na orla pelo próprio app. QR Code no celular, passei direto na entrada sem fila.',
  },
  {
    nome: 'Dona Cleide',
    papel: 'Ambulante',
    local: 'Vila Caiçara',
    nota: 5,
    texto:
      'Eu vendo sanduíche natural e antes dependia de passar na frente da pessoa na hora certa. Agora elas me acham quando estão com fome.',
  },
  {
    nome: 'Felipe A.',
    papel: 'Cliente',
    local: 'Itanhaém, SP',
    nota: 5,
    texto:
      'Chatinho é ficar procurando carteira com a mão cheia de areia. Resolvi tudo pelo celular e ainda usei um cupom do quiosque.',
  },
  {
    nome: 'Espetinho do Gordo',
    papel: 'Restaurante',
    local: 'Praia Grande, SP',
    nota: 5,
    texto:
      'Ver a data que cada valor libera me deu paz. Sei exatamente quanto vou receber e quando, e o saque cai na conta do restaurante.',
  },
  {
    nome: 'Patrícia N.',
    papel: 'Cliente',
    local: 'Santos, SP',
    nota: 5,
    texto:
      'Tive problema num pedido e o atendimento do app resolveu na mesma hora, de madrugada. Não esperei dia útil pra ninguém responder.',
  },
  {
    nome: 'Wesley T.',
    papel: 'Ambulante',
    local: 'Boqueirão',
    nota: 4,
    texto:
      'No começo estranhei mexer no celular vendendo. Depois de dois fins de semana já era automático. Fico online e o pedido vem.',
  },
  {
    nome: 'Larissa F.',
    papel: 'Cliente',
    local: 'Praia Grande, SP',
    nota: 5,
    texto:
      'Fui pra praia sozinha e não queria deixar minhas coisas na areia pra ir comprar comida. O app resolveu exatamente isso.',
  },
  {
    nome: 'Restaurante Canto do Mar',
    papel: 'Restaurante',
    local: 'Guarujá, SP',
    nota: 5,
    texto:
      'Não instalei nada em máquina nenhuma. Abro no navegador do tablet e os pedidos aparecem. Pra quem já tem sistema demais, isso conta.',
  },
  {
    nome: 'Rodrigo C.',
    papel: 'Cliente',
    local: 'Praia Grande, SP',
    nota: 5,
    texto:
      'Achei um ambulante de queijo coalho a 200 metros que eu nem tinha visto passar. Pedi e ele veio direto no meu guarda-sol.',
  },
  {
    nome: 'Sandra M.',
    papel: 'Ambulante',
    local: 'Ocian',
    nota: 5,
    texto:
      'Meu marido e eu revezamos a banca. Um fica online enquanto o outro descansa, e não perdemos venda em nenhum momento do dia.',
  },
]

/* ── Perguntas frequentes ───────────────────────────────────── */
export const FAQ = [
  {
    p: 'O PraiaGo é pago pra quem usa?',
    r: 'Pra quem pede, não: baixar e usar o app é de graça, você paga só o que comprou mais a entrega quando houver. Pra quem vende, não tem mensalidade nem taxa de adesão — só um percentual sobre a venda concluída.',
  },
  {
    p: 'Preciso de CNPJ pra vender como ambulante?',
    r: 'Não. O cadastro de ambulante é feito com documento pessoal e passa por uma conferência antes de você aparecer no mapa. Restaurante e loja seguem o cadastro de estabelecimento.',
  },
  {
    p: 'Como o entregador me acha na areia?',
    r: 'Na hora do pedido você marca no mapa onde está e pode escrever uma referência (a cor do guarda-sol, o quiosque mais perto, o número da rua da orla). O ambulante recebe isso junto com o pedido.',
  },
  {
    p: 'E se eu pedir e ninguém entregar?',
    r: 'Pedido que não é aceito não é cobrado. Se algo der errado depois de pago, o atendimento dentro do app resolve o estorno.',
  },
  {
    p: 'Como o dinheiro chega pra quem vendeu?',
    r: 'Você cadastra banco, agência e conta uma vez. O valor de cada venda entra na sua carteira assim que o pedido é concluído e fica visível com a data de liberação — o repasse é em 7 dias. Liberou, você pede o saque na própria tela e o dinheiro cai na conta cadastrada, com a menor taxa do mercado, sempre visível antes de você confirmar.',
  },
  {
    p: 'Funciona em qual praia?',
    r: 'O PraiaGo está começando pela Baixada Santista e cresce conforme ambulantes e restaurantes vão se cadastrando. Se ainda não tem ninguém na sua praia, o cadastro já está aberto.',
  },
]
