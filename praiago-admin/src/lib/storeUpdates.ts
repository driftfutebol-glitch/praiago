// Public links only. Server verification uses its own fixed allowlist, not browser input.
export type AppSlug = 'cliente' | 'ambulante'
export type StorePlatform = 'android' | 'ios'
export function storeUrl(app: AppSlug, platform: StorePlatform) {
  return platform === 'android'
    ? `https://play.google.com/store/apps/details?id=com.ferrazcode.praiago.${app}`
    : `https://apps.apple.com/br/app/id${app === 'cliente' ? 6804792683 : 6804793330}`
}
