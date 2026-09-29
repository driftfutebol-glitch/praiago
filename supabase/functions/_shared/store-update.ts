export type AppSlug = 'cliente' | 'ambulante'
export type StorePlatform = 'android' | 'ios'

export const stores = {
  cliente: { bundle: 'com.ferrazcode.praiago.cliente', apple: 6804792683 },
  ambulante: { bundle: 'com.ferrazcode.praiago.ambulante', apple: 6804793330 },
} as const

export function validTarget(app: unknown, platform: unknown): app is AppSlug {
  return (app === 'cliente' || app === 'ambulante') && (platform === 'android' || platform === 'ios')
}

export function storeUrl(app: AppSlug, platform: StorePlatform) {
  return platform === 'android'
    ? `https://play.google.com/store/apps/details?id=${stores[app].bundle}`
    : `https://apps.apple.com/br/app/id${stores[app].apple}`
}

export function numericVersion(value: unknown): number[] | null {
  if (typeof value !== 'string' || !/^\d{1,6}(\.\d{1,6}){0,2}$/.test(value)) return null
  const parts = value.split('.').map(Number)
  while (parts.length < 3) parts.push(0)
  return parts
}

export function compareVersions(a: unknown, b: unknown): number | null {
  const left = numericVersion(a), right = numericVersion(b)
  if (!left || !right) return null
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1
  return 0
}

export function compatibleNative(native: unknown, minimum: string | null, maximum: string | null) {
  if (!minimum && !maximum) return true // Preserve legacy releases without a range.
  if (!numericVersion(native)) return false
  return (!minimum || (compareVersions(native, minimum) ?? -1) >= 0)
    && (!maximum || (compareVersions(native, maximum) ?? 1) <= 0)
}
