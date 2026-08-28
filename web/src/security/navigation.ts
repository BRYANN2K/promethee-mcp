const AUTHORIZATION_ID_PATTERN = /^[A-Za-z0-9_-]{16,256}$/
const BLOCKED_PROTOCOLS = new Set([
  'about:',
  'blob:',
  'data:',
  'file:',
  'javascript:',
  'vbscript:',
])

export function readAuthorizationId(location: URL): string | null {
  const values = location.searchParams.getAll('authorization_id')
  if (values.length !== 1) return null
  const value = values[0]
  return value !== undefined && AUTHORIZATION_ID_PATTERN.test(value) ? value : null
}

export function buildConsentPath(authorizationId: string): string {
  const search = new URLSearchParams({ authorization_id: authorizationId })
  return `/oauth/consent?${search.toString()}`
}

export function buildLoginPath(authorizationId: string): string {
  const search = new URLSearchParams({ authorization_id: authorizationId })
  return `/login?${search.toString()}`
}

function isLoopback(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === '[::1]' || hostname === 'localhost'
}

export function isLoopbackDevelopment(isDevelopment: boolean, location: URL): boolean {
  return isDevelopment &&
    location.protocol === 'http:' &&
    location.username === '' &&
    location.password === '' &&
    isLoopback(location.hostname)
}

export function safeProviderRedirect(value: string): string | null {
  if (value.length === 0 || value.length > 4096) return null

  try {
    const url = new URL(value)
    if (url.username !== '' || url.password !== '') return null
    if (BLOCKED_PROTOCOLS.has(url.protocol)) return null
    if (url.protocol === 'https:') return url.href
    if (url.protocol === 'http:') return isLoopback(url.hostname) ? url.href : null

    return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

export function safeAuthorizationRedirect(value: string, registeredValue: string): string | null {
  const safeValue = safeProviderRedirect(value)
  const safeRegistered = safeProviderRedirect(registeredValue)
  if (safeValue === null || safeRegistered === null) return null

  const target = new URL(safeValue)
  const registered = new URL(safeRegistered)
  if (
    target.protocol !== registered.protocol ||
    target.hostname !== registered.hostname ||
    target.port !== registered.port ||
    target.pathname !== registered.pathname ||
    target.username !== '' ||
    target.password !== '' ||
    target.hash !== ''
  ) {
    return null
  }
  return target.href
}
