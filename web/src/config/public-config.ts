export type PublicConfig = Readonly<{
  supabaseUrl: string
  supabasePublishableKey: string
}>

export type PublicConfigResult =
  | Readonly<{ ok: true; value: PublicConfig }>
  | Readonly<{
      ok: false
      reason: 'missing' | 'unsafe-key' | 'unsafe-url'
    }>

const APPROVED_SUPABASE_ORIGIN = 'https://auth.promethee.io'

type PublicEnvironment = Readonly<{
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
}>

function hasAnonRole(key: string): boolean {
  const segments = key.split('.')
  if (segments.length !== 3 || segments[1] === undefined) return false

  try {
    const normalized = segments[1].replaceAll('-', '+').replaceAll('_', '/')
    const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
    const payload: unknown = JSON.parse(atob(`${normalized}${padding}`))
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'role' in payload &&
      payload.role === 'anon'
    )
  } catch {
    return false
  }
}

function isBrowserSafeKey(key: string): boolean {
  if (key.length < 24 || key.length > 4096 || /\s/.test(key)) return false
  if (key === 'service_role' || key.startsWith('sb_secret_')) return false
  if (key.startsWith('sb_publishable_')) return true
  return hasAnonRole(key)
}

function normalizeSupabaseUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') {
      return null
    }
    if (url.pathname !== '/' || url.search !== '' || url.hash !== '') return null
    return url.origin
  } catch {
    return null
  }
}

export function parsePublicConfig(env: PublicEnvironment): PublicConfigResult {
  const rawUrl = env.VITE_SUPABASE_URL?.trim()
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!rawUrl || !key) return { ok: false, reason: 'missing' }

  const supabaseUrl = normalizeSupabaseUrl(rawUrl)
  if (supabaseUrl === null) return { ok: false, reason: 'unsafe-url' }
  if (supabaseUrl !== APPROVED_SUPABASE_ORIGIN) return { ok: false, reason: 'unsafe-url' }
  if (!isBrowserSafeKey(key)) return { ok: false, reason: 'unsafe-key' }

  return {
    ok: true,
    value: {
      supabaseUrl,
      supabasePublishableKey: key,
    },
  }
}
