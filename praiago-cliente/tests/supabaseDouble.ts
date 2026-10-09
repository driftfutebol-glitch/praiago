// Dublê exclusivamente local. Não é importado por nenhuma entrada de produção.
export const fixtureProfile = { id: 'fixture-cliente', nome: 'Marina Costa', email: 'marina@example.test', telefone: '13999990000', role: 'cliente', status: 'ativo', conta_demo: false, cpf: '00000000000', cpf_check_status: 'aprovado', email_verificado: true, foto_perfil_path: null }
export const fixtureUser = { id: fixtureProfile.id, email: fixtureProfile.email, email_confirmed_at: '2026-09-01T00:00:00Z', user_metadata: { nome: fixtureProfile.nome } }
export const scenario = {
  tables: {} as Record<string, Record<string, any>[]>,
  errors: {} as Record<string, unknown>,
  calls: [] as { table: string; action: string; fields: string; values?: unknown; from: number; to: number }[],
  authError: null as null | { message: string; status?: number },
  authUser: fixtureUser as typeof fixtureUser | null,
  signIns: [] as unknown[],
  signOuts: 0,
  signups: [] as unknown[],
}

export function resetScenario() {
  scenario.tables = { profiles: [{ ...fixtureProfile }], produtos: [], promocoes: [], vendedores_publicos: [], eventos: [], cupons: [] }
  scenario.errors = {}; scenario.calls = []; scenario.authError = null; scenario.authUser = { ...fixtureUser }
  scenario.signIns = []; scenario.signOuts = 0; scenario.signups = []
}
resetScenario()

function query(table: string) {
  let fields = '*', from = 0, to = Infinity, action = 'select'
  let values: Record<string, unknown> | undefined
  const filters: ((row: Record<string, any>) => boolean)[] = []
  const result = (one = false) => {
    scenario.calls.push({ table, action, fields, values, from, to })
    const error = scenario.errors[table] || null
    let rows = (scenario.tables[table] || []).filter(row => filters.every(filter => filter(row)))
    if (action === 'update' && !error) rows.forEach(row => Object.assign(row, values))
    rows = rows.slice(from, to === Infinity ? undefined : to + 1)
    return Promise.resolve({ data: error ? null : one ? rows[0] || null : rows.map(row => ({ ...row })), error })
  }
  const builder: any = {
    select: (value = '*') => { fields = value; return builder },
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return builder },
    in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return builder },
    lte: () => builder, or: () => builder, order: () => builder,
    limit: (limit: number) => { to = limit - 1; return builder },
    range: (start: number, end: number) => { from = start; to = end; return builder },
    update: (value: Record<string, unknown>) => { action = 'update'; values = value; return builder },
    insert: () => { throw new Error('Inserções desabilitadas nesta prévia local') },
    single: () => result(true), maybeSingle: () => result(true),
    then: (resolve: any, reject: any) => result().then(resolve, reject),
  }
  return builder
}

export const supabase = {
  from: query,
  auth: {
    getUser: async () => ({ data: { user: scenario.authUser }, error: null }),
    getSession: async () => ({ data: { session: scenario.authUser ? { user: scenario.authUser } : null }, error: null }),
    signInWithPassword: async (values: unknown) => { scenario.signIns.push(values); return { data: { user: scenario.authUser }, error: scenario.authError } },
    signOut: async () => { scenario.signOuts++; return { error: null } },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    resend: async () => ({ error: scenario.authError }),
    resetPasswordForEmail: async () => ({ error: scenario.authError }),
    verifyOtp: async () => ({ data: { user: scenario.authUser }, error: scenario.authError }),
    updateUser: async () => ({ error: scenario.authError }),
  },
  functions: { invoke: async (name: string, values: unknown) => {
    if (name === 'cadastro') { scenario.signups.push(values); return { data: {}, error: scenario.authError } }
    return { data: null, error: new Error('Ação externa indisponível na prévia local') }
  } },
  storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }), upload: async () => ({ error: new Error('Upload desabilitado na prévia') }), remove: async () => ({ error: new Error('Remoção desabilitada na prévia') }) }) },
  channel: () => { const c = { on: () => c, subscribe: () => c, send: async () => 'ok' }; return c },
  removeChannel: async () => 'ok',
  rpc: async () => ({ data: null, error: new Error('RPC desabilitado na prévia') }),
}
export const VEIO_DE_RECOVERY = false
