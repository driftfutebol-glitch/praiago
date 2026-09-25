import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
vi.mock('../src/lib/supabase', () => import('./supabaseDouble'))
vi.mock('../src/lib/securityAudit', () => ({ logSecurityEvent: vi.fn() }))
vi.mock('../src/lib/ota', () => ({ versaoDoPacote: async () => 'web' }))
import PerfilPage from '../src/pages/PerfilPage'
import EditProfileDialog from '../src/components/EditProfileDialog'
import { useStore } from '../src/store/useStore'
import { usePreferences } from '../src/store/usePreferences'
import AppearanceSync from '../src/components/AppearanceSync'
import { fixtureProfile, resetScenario, scenario } from './supabaseDouble'

function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output> }
function page() { return render(<MemoryRouter initialEntries={['/perfil']}><MotionConfig reducedMotion="always"><AppearanceSync/><PerfilPage/><Location/></MotionConfig></MemoryRouter>) }
function session() { useStore.getState().login(fixtureProfile.id, fixtureProfile.email, fixtureProfile.nome, fixtureProfile.telefone) }
beforeEach(() => { resetScenario(); useStore.getState().logout(); usePreferences.setState({ darkMode: false, reducedMotion: false, notificationSounds: true, mapStyle: 'praia' }) })

describe('Aparência no Perfil', () => {
  it.each([false, true])('troca e persiste o tema sem alterar a sessão (logado: %s)', async loggedIn => {
    if (loggedIn) session()
    const previousSession = useStore.getState().sessao
    page()
    const toggle = screen.getByRole('switch', { name: 'Modo escuro', exact: true })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await userEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(JSON.parse(localStorage.getItem('praiago-cliente-preferences')!).state.darkMode).toBe(true)
    expect(useStore.getState().sessao).toBe(previousSession)
    expect(scenario.signIns).toHaveLength(0)
    expect(scenario.signups).toHaveLength(0)
    expect(scenario.calls.filter(c => c.action === 'update')).toHaveLength(0)
    await userEvent.click(toggle)
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})

describe('Acesso e proteção da conta', () => {
  it('mostra controles rotulados e autofill correto', () => {
    page()
    expect(screen.getByLabelText('E-mail').getAttribute('autocomplete')).toBe('email')
    expect(screen.getByLabelText('Senha').getAttribute('autocomplete')).toBe('current-password')
    expect(screen.getByRole('button', { name: 'Entrar', exact: true }).getAttribute('aria-pressed')).toBe('true')
  })
  it('mostrar senha não envia o formulário', async () => {
    page(); await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(screen.getByLabelText('Senha').getAttribute('type')).toBe('text')
    expect(scenario.signIns).toHaveLength(0)
  })
  it('não envia login inválido', async () => {
    page(); await userEvent.click(screen.getByRole('button', { name: 'Entrar na minha conta' }))
    expect(screen.getByRole('alert').textContent).toContain('e-mail válido')
    expect(scenario.signIns).toHaveLength(0)
  })
  it('normaliza e-mail e carrega nome e telefone do perfil no login', async () => {
    page()
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'MARINA@example.test' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'SenhaTeste123' } })
    await userEvent.click(screen.getByRole('button', { name: 'Entrar na minha conta' }))
    await screen.findByRole('button', { name: /Editar perfil e foto/ })
    expect(scenario.signIns[0]).toEqual({ email: 'marina@example.test', password: 'SenhaTeste123' })
    expect(useStore.getState().sessao?.telefone).toBe(fixtureProfile.telefone)
  })
  it.each([{ role: 'ambulante' }, { status: 'banido' }])('recusa conta não autorizada %j', async change => {
    Object.assign(scenario.tables.profiles[0], change)
    page()
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: fixtureProfile.email } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'SenhaTeste123' } })
    await userEvent.click(screen.getByRole('button', { name: 'Entrar na minha conta' }))
    await screen.findByRole('alert')
    expect(useStore.getState().sessao).toBeNull()
    expect(scenario.signOuts).toBe(1)
  })
  it('traduz falhas do provedor sem exibir detalhes internos', async () => {
    scenario.authError = { message: 'Internal database error: secret_table', status: 500 }
    page()
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: fixtureProfile.email } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'SenhaTeste123' } })
    await userEvent.click(screen.getByRole('button', { name: 'Entrar na minha conta' }))
    expect((await screen.findByRole('alert')).textContent).not.toContain('secret_table')
    expect(screen.getByRole('alert').textContent).toContain('Não foi possível entrar')
  })
  it('mantém CPF e termos obrigatórios no cadastro', async () => {
    page(); await userEvent.click(screen.getByRole('button', { name: 'Criar conta', exact: true }))
    fireEvent.change(screen.getByLabelText('Nome Completo'), { target: { value: 'Cliente de teste' } })
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'teste@example.test' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'SenhaTeste123' } })
    await userEvent.click(screen.getByRole('button', { name: 'Criar minha conta' }))
    expect(screen.getByRole('alert').textContent).toContain('CPF válido')
    fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '52998224725' } })
    await userEvent.click(screen.getByRole('button', { name: 'Criar minha conta' }))
    expect(screen.getByRole('alert').textContent).toContain('aceitar os Termos')
    expect(scenario.signups).toHaveLength(0)
  })
  it('cadastro confirmado pelo servidor vai para código, não libera sessão', async () => {
    page(); await userEvent.click(screen.getByRole('button', { name: 'Criar conta', exact: true }))
    fireEvent.change(screen.getByLabelText('Nome Completo'), { target: { value: 'Cliente de teste' } })
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'teste@example.test' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'SenhaTeste123' } })
    fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '52998224725' } })
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Criar minha conta' }))
    expect((await screen.findByLabelText('Código de confirmação')).getAttribute('autocomplete')).toBe('one-time-code')
    expect(useStore.getState().sessao).toBeNull()
    expect(scenario.signups).toHaveLength(1)
  })
})

describe('Perfil funcional', () => {
  it.each([
    { label: /Favoritos/, url: '/?filtro=favoritos' },
    { label: /^Notificações/, url: '/?painel=notificacoes' },
    { label: /^Meus cupons/, url: '/?painel=cupons' },
    { label: /^Explorar outra região/, url: '/?painel=regiao' },
  ])('abre destino de $url', async ({ label, url }) => {
    session(); page(); await userEvent.click(screen.getByRole('button', { name: label }))
    expect(screen.getByTestId('location').textContent).toBe(url)
  })
  it('preferências alteram o estado persistido', async () => {
    session(); page()
    await userEvent.click(screen.getByRole('switch', { name: /Sons de avisos/ }))
    await userEvent.click(screen.getByRole('switch', { name: /Reduzir movimento/ }))
    expect(usePreferences.getState().notificationSounds).toBe(false)
    expect(usePreferences.getState().reducedMotion).toBe(true)
    expect(JSON.parse(localStorage.getItem('praiago-cliente-preferences')!).state.reducedMotion).toBe(true)
  })
  it('salva só nome e telefone e atualiza o perfil local após sucesso', async () => {
    session(); const onClose = vi.fn()
    render(<EditProfileDialog photo={null} onPhotoChange={vi.fn()} onClose={onClose}/>)
    await waitFor(() => expect((screen.getByLabelText('Seu nome') as HTMLInputElement).disabled).toBe(false))
    fireEvent.change(screen.getByLabelText('Seu nome'), { target: { value: '  Marina   Silva  ' } })
    fireEvent.change(screen.getByLabelText(/Telefone com DDD/), { target: { value: '(13) 98888-1234' } })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(scenario.calls.find(c => c.action === 'update')?.values).toEqual({ nome: 'Marina Silva', telefone: '13988881234' })
    expect(useStore.getState().sessao?.nome).toBe('Marina Silva')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('não muda o perfil local quando o servidor rejeita a gravação', async () => {
    session(); render(<EditProfileDialog photo={null} onPhotoChange={vi.fn()} onClose={vi.fn()}/>)
    await waitFor(() => expect((screen.getByLabelText('Seu nome') as HTMLInputElement).disabled).toBe(false))
    scenario.errors.profiles = new Error('offline')
    fireEvent.change(screen.getByLabelText('Seu nome'), { target: { value: 'Nome novo' } })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect((await screen.findByRole('alert')).textContent).toContain('dados anteriores foram mantidos')
    expect(useStore.getState().sessao?.nome).toBe(fixtureProfile.nome)
  })
})
