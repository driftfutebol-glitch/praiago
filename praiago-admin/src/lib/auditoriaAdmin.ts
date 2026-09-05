import { supabase } from './supabase'

// Registro do que o ADMIN faz — não do que o usuário faz.
//
// A auditoria que existia cobria só autenticação: quem entrou, quem errou a
// senha, quem pediu troca. Nada dizia quem baniu uma conta, quem aprovou um
// KYC, quem apagou um cadastro. Numa equipe de cinco sysadmins, "sumiu" não
// tinha dono.
//
// Tudo entra como event_type 'admin_action' e o detalhe vive no metadata. É de
// propósito: cada tipo novo de evento exigiria um ALTER na constraint do banco,
// e mudança de schema em produção neste projeto é cara. Com um tipo genérico e
// metadata livre, ação nova é uma linha de código.

export type AcaoAdmin =
  | 'banir_conta'
  | 'desbanir_conta'
  | 'verificar_conta'
  | 'desverificar_conta'
  | 'resetar_senha'
  | 'abrir_exclusao'
  | 'concluir_exclusao'
  | 'aprovar_kyc'
  | 'rejeitar_kyc'
  | 'criar_admin'
  | 'excluir_admin'
  | 'liberar_saque'
  | 'alterar_permissoes'
  | 'marcar_tester'
  | 'desmarcar_tester'

// O IP vem do servidor, não do navegador: `meu-ip` lê o x-forwarded-for real da
// requisição. IP que a própria página informa não vale como prova de nada.
//
// Buscado uma vez por sessão de aba. Se falhar, a ação é registrada mesmo
// assim — auditoria incompleta é melhor que auditoria ausente, e um registro
// sem IP ainda diz quem fez o quê e quando.
let ipDaSessao: string | null = null
let buscaDeIp: Promise<string | null> | null = null

async function ipAtual(): Promise<string | null> {
  if (ipDaSessao) return ipDaSessao
  if (!buscaDeIp) {
    buscaDeIp = supabase.functions
      .invoke('meu-ip')
      .then(({ data }) => {
        const ip = (data as { ip?: string } | null)?.ip
        ipDaSessao = typeof ip === 'string' ? ip : null
        return ipDaSessao
      })
      .catch(() => null)
  }
  return buscaDeIp
}

/**
 * Grava uma ação de administrador na auditoria.
 *
 * @param acao     o que foi feito
 * @param alvo     e-mail ou id de quem sofreu a ação (aparece na busca)
 * @param detalhes qualquer contexto útil: motivo, valor antigo, valor novo
 */
export async function registrarAcaoAdmin(
  acao: AcaoAdmin,
  alvo?: string | null,
  detalhes: Record<string, unknown> = {},
) {
  try {
    const { data: sessao } = await supabase.auth.getSession()
    if (!sessao.session) return

    const ip = await ipAtual()
    const { data: perfil } = await supabase
      .from('profiles')
      .select('email,nome')
      .eq('id', sessao.session.user.id)
      .maybeSingle()

    await supabase.rpc('log_security_event', {
      p_event_type: 'admin_action',
      p_platform: 'admin',
      // O e-mail da coluna é o do ALVO, porque é por ele que se busca "o que
      // fizeram com esta conta". Quem executou fica no metadata.
      p_email: alvo ? String(alvo).trim().toLowerCase() : null,
      p_user_agent: navigator.userAgent,
      p_route: window.location.pathname,
      p_metadata: {
        acao,
        alvo: alvo ?? null,
        por_email: perfil?.email ?? null,
        por_nome: perfil?.nome ?? null,
        ip: ip ?? 'nao_capturado',
        em: new Date().toISOString(),
        ...detalhes,
      },
    })
  } catch (erro) {
    // Nunca derruba a operação que estava sendo auditada: falhar em registrar
    // não pode impedir o admin de banir alguém.
    console.warn('Falha ao registrar acao de admin', erro)
  }
}
