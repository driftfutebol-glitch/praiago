// Tokens semânticos: os mesmos estilos inline acompanham o tema sem novas
// assinaturas React. As variáveis são resolvidas pelo navegador no elemento.
export const theme = {
  color: {
    bg: 'var(--pg-sand)',
    surface: 'var(--pg-surface)',
    surfaceAlt: 'var(--pg-surface-alt)',
    border: 'var(--pg-line)',
    text: 'var(--pg-ink)',
    textMuted: 'var(--pg-muted)',
    textFaint: 'var(--pg-faint)',
    primary: 'var(--pg-ocean)',
    accent: 'var(--pg-success)',
    danger: 'var(--pg-danger)',
    warning: 'var(--pg-warning)',
    star: 'var(--pg-star, #fbbf24)',
    purple: 'var(--pg-purple, #a855f7)',
    light: 'var(--pg-on-brand)',
  },
  gradient: {
    brand: 'var(--pg-brand-gradient)',
    brandSoft: 'var(--pg-brand-soft)',
  },
  radius: { sm: 12, md: 16, lg: 20, xl: 24, pill: 999 },
  shadow: {
    card: 'var(--pg-shadow)',
    float: 'var(--pg-shadow)',
    brand: 'var(--pg-shadow)',
  },
} as const

export type Theme = typeof theme
