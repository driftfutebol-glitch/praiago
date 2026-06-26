// Design tokens do app Cliente (tema escuro, estilo iFood)
// Centraliza cores/raios/sombras antes espalhados em inline styles.
export const theme = {
  color: {
    bg: '#0f172a',
    surface: '#1e293b',
    surfaceAlt: '#0f172a',
    border: '#334155',
    text: '#f1f5f9',
    textMuted: '#64748b',
    textFaint: '#475569',
    primary: '#0ea5e9',
    accent: '#22c55e',
    danger: '#ef4444',
    warning: '#f97316',
    star: '#fbbf24',
    purple: '#a855f7',
    light: '#fff',
  },
  gradient: {
    brand: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
    brandSoft: 'linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%)',
  },
  radius: { sm: 12, md: 16, lg: 20, xl: 24, pill: 999 },
  shadow: {
    card: '0 4px 15px rgba(0,0,0,0.06)',
    float: '0 12px 40px rgba(0,0,0,0.12)',
    brand: '0 16px 40px rgba(14,165,233,0.35)',
  },
} as const

export type Theme = typeof theme
