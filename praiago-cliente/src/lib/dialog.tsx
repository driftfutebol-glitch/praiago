// Pop-ups bonitos do PraiaGo — substituem window.confirm / alert / prompt.
// API imperativa: chame confirmDialog/alertDialog/promptDialog de qualquer lugar
// (retornam Promise) e monte <DialogHost/> uma vez no App.
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

type Tone = 'default' | 'danger' | 'success'
type Kind = 'confirm' | 'alert' | 'prompt'

type DialogState = {
  id: number
  kind: Kind
  title: string
  message?: string
  confirmText: string
  cancelText: string
  tone: Tone
  placeholder?: string
  defaultValue?: string
  secret?: boolean
  resolve: (v: boolean | string | null) => void
}

type Opts = {
  title?: string
  message?: string
  confirmText?: string
  cancelText?: string
  tone?: Tone
  placeholder?: string
  defaultValue?: string
  secret?: boolean
}

const listeners = new Set<(d: DialogState | null) => void>()
let current: DialogState | null = null
let seq = 0

function emit(d: DialogState | null) {
  current = d
  listeners.forEach(l => l(d))
}

function norm(input: string | Opts): Opts {
  return typeof input === 'string' ? { message: input } : input
}

function open(kind: Kind, base: Opts, input: string | Opts): Promise<boolean | string | null> {
  const o = { ...base, ...norm(input) }
  return new Promise(resolve => {
    emit({
      id: ++seq,
      kind,
      title: o.title || (kind === 'confirm' ? 'Confirmar' : kind === 'prompt' ? 'Digite' : 'Aviso'),
      message: o.message,
      confirmText: o.confirmText || (kind === 'alert' ? 'Entendi' : 'Confirmar'),
      cancelText: o.cancelText || 'Cancelar',
      tone: o.tone || 'default',
      placeholder: o.placeholder,
      defaultValue: o.defaultValue,
      secret: o.secret,
      resolve,
    })
  })
}

export function confirmDialog(input: string | Opts): Promise<boolean> {
  return open('confirm', {}, input) as Promise<boolean>
}
export function alertDialog(input: string | Opts): Promise<void> {
  return open('alert', {}, input).then(() => undefined)
}
export function promptDialog(input: string | Opts): Promise<string | null> {
  return open('prompt', {}, input) as Promise<string | null>
}

const ACCENT = 'var(--pg-brand-gradient)'
const CARD_BG = 'var(--pg-surface)'
const TITLE = 'var(--pg-ink)'
const TEXT = 'var(--pg-muted)'

export function DialogHost() {
  const [dlg, setDlg] = useState<DialogState | null>(current)
  const [valor, setValor] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const l = (d: DialogState | null) => { setDlg(d); setValor(d?.defaultValue || '') }
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])

  useEffect(() => {
    if (dlg?.kind === 'prompt') setTimeout(() => inputRef.current?.focus(), 80)
  }, [dlg?.id, dlg?.kind])

  function fechar(resultado: boolean | string | null) {
    dlg?.resolve(resultado)
    emit(null)
  }

  const confirmar = () => fechar(dlg?.kind === 'prompt' ? valor : true)
  const cancelar = () => fechar(dlg?.kind === 'prompt' ? null : false)

  const danger = dlg?.tone === 'danger'
  const success = dlg?.tone === 'success'
  const Icon = danger ? AlertTriangle : success ? CheckCircle2 : Info
  const iconBg = danger ? 'var(--pg-danger-bg)' : success ? 'var(--pg-success-bg)' : 'var(--pg-surface-alt)'
  const iconColor = danger ? 'var(--pg-danger)' : success ? 'var(--pg-success)' : 'var(--pg-ocean)'
  const confirmBg = danger ? 'var(--pg-danger-bg)' : ACCENT
  const confirmColor = danger ? 'var(--pg-danger)' : 'var(--pg-on-brand)'

  return (
    <AnimatePresence>
      {dlg && (
        <motion.div
          key={dlg.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dlg.kind === 'alert' ? confirmar : cancelar}
          style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'var(--pg-overlay)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <motion.div
            initial={{ scale: 0.92, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 8, opacity: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 400, background: CARD_BG, border: '1px solid var(--pg-line)', borderRadius: 26, padding: 26, boxShadow: 'var(--pg-shadow)', position: 'relative' }}
          >
            <button aria-label="Fechar" onClick={cancelar} style={{ position: 'absolute', top: 16, right: 16, width: 32, height: 32, border: 0, borderRadius: 10, background: 'var(--pg-surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={16} color="var(--pg-faint)" />
            </button>

            <div style={{ width: 52, height: 52, borderRadius: 18, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Icon size={26} color={iconColor} />
            </div>

            <div style={{ fontSize: 19, fontWeight: 900, color: TITLE, letterSpacing: -0.3 }}>{dlg.title}</div>
            {dlg.message && <div style={{ fontSize: 14, color: TEXT, fontWeight: 500, marginTop: 8, lineHeight: 1.5 }}>{dlg.message}</div>}

            {dlg.kind === 'prompt' && (
              <input
                ref={inputRef}
                type={dlg.secret ? 'password' : 'text'}
                value={valor}
                onChange={e => setValor(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmar(); if (e.key === 'Escape') cancelar() }}
                placeholder={dlg.placeholder}
                style={{ width: '100%', boxSizing: 'border-box', marginTop: 16, background: 'var(--pg-input)', border: '1px solid var(--pg-line)', borderRadius: 14, padding: '13px 14px', fontSize: 15, fontWeight: 600, color: TITLE, outline: 'none' }}
              />
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              {dlg.kind !== 'alert' && (
                <button onClick={cancelar} style={{ flex: 1, border: '1px solid var(--pg-line)', background: 'var(--pg-input)', color: 'var(--pg-muted)', borderRadius: 14, padding: 14, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
                  {dlg.cancelText}
                </button>
              )}
              <button onClick={confirmar} style={{ flex: dlg.kind === 'alert' ? undefined : 1.4, width: dlg.kind === 'alert' ? '100%' : undefined, border: danger ? '1px solid var(--pg-danger)' : 0, background: confirmBg, color: confirmColor, borderRadius: 14, padding: 14, fontSize: 15, fontWeight: 900, cursor: 'pointer', boxShadow: 'var(--pg-shadow)' }}>
                {dlg.confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
