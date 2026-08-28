import type { Session } from '@supabase/supabase-js'

export type PersonalBridgeFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type PersonalBridgeConfig = Readonly<{
  baseUrl: string
  supabaseUrl: string
  supabasePublishableKey: string
  requestTimeoutMs?: number
}>

export type PersonalRetentionMode = 'seven-days' | 'memory'
export type PersonalPairingResult =
  | Readonly<{ ok: true; retention: PersonalRetentionMode }>
  | Readonly<{ ok: false; failure: 'settings' | 'pairing' }>

const BRIDGE_REQUEST_TIMEOUT_MS = 8_000

function requestTimeout(value: number | undefined): number {
  return Number.isSafeInteger(value) && value !== undefined && value > 0 && value <= BRIDGE_REQUEST_TIMEOUT_MS
    ? value
    : BRIDGE_REQUEST_TIMEOUT_MS
}

async function withBridgeTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error('bridge_timeout'))
    }, timeoutMs)
  })
  try {
    return await Promise.race([operation(controller.signal), timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export function normalizePersonalBridgeUrl(value: string): string | null {
  try {
    const url = new URL(value)
    const loopbackHttp =
      url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
    const productionHttps =
      url.protocol === 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost'
    if (
      (!loopbackHttp && !productionHttps) ||
      url.username !== '' ||
      url.password !== '' ||
      url.pathname !== '/' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      return null
    }
    return url.origin
  } catch {
    return null
  }
}

function isLoopbackHttp(url: URL): boolean {
  return (
    url.protocol === 'http:' &&
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
  )
}

export function resolvePersonalBridgeUrl(
  configuredBaseUrl: string | undefined,
  development: boolean,
  pageUrl: URL,
): string | null {
  const developmentLoopback = development && isLoopbackHttp(pageUrl)
  if (configuredBaseUrl === undefined) {
    if (developmentLoopback) return 'http://127.0.0.1:3210'
    return isLoopbackHttp(pageUrl) ? pageUrl.origin : null
  }
  const baseUrl = normalizePersonalBridgeUrl(configuredBaseUrl)
  if (baseUrl === null) return null
  const parsedBaseUrl = new URL(baseUrl)
  if (developmentLoopback && isLoopbackHttp(parsedBaseUrl)) return baseUrl
  if (isLoopbackHttp(pageUrl) && pageUrl.origin === baseUrl) return baseUrl
  return pageUrl.protocol === 'https:' && pageUrl.origin === baseUrl ? baseUrl : null
}

function bridgeCredentials(baseUrl: string): RequestCredentials {
  return typeof window !== 'undefined' && window.location.origin === baseUrl ? 'same-origin' : 'omit'
}

function retentionMode(value: unknown): PersonalRetentionMode | null {
  if (typeof value !== 'object' || value === null) return null
  const mode = Reflect.get(value, 'mode')
  return mode === 'seven-days' || mode === 'memory' ? mode : null
}

export async function loadPersonalRetention(
  configuredBaseUrl: string,
  fetcher: PersonalBridgeFetch = window.fetch.bind(window),
  timeoutMs = BRIDGE_REQUEST_TIMEOUT_MS,
): Promise<PersonalRetentionMode | null> {
  const baseUrl = normalizePersonalBridgeUrl(configuredBaseUrl)
  if (baseUrl === null) return null
  try {
    return await withBridgeTimeout(async (signal) => {
      const response = await fetcher(`${baseUrl}/connect/settings`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: bridgeCredentials(baseUrl),
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal,
      })
      if (!response.ok) return null
      return retentionMode(await response.json())
    }, requestTimeout(timeoutMs))
  } catch {
    return null
  }
}

export async function connectPersonalBridge(
  config: PersonalBridgeConfig,
  session: Session,
  retention: PersonalRetentionMode,
  fetcher: PersonalBridgeFetch = window.fetch.bind(window),
): Promise<PersonalPairingResult> {
  const baseUrl = normalizePersonalBridgeUrl(config.baseUrl)
  const expiresAt = session.expires_at
  if (
    baseUrl === null ||
    (retention !== 'seven-days' && retention !== 'memory') ||
    session.access_token.length === 0 ||
    session.refresh_token.length === 0 ||
    expiresAt === undefined
  ) {
    return { ok: false, failure: 'pairing' }
  }

  const credentials = bridgeCredentials(baseUrl)
  const timeoutMs = requestTimeout(config.requestTimeoutMs)
  try {
    const savedRetention = await withBridgeTimeout(async (signal) => {
      const response = await fetcher(`${baseUrl}/connect/settings`, {
        method: 'PUT',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: retention }),
        cache: 'no-store',
        credentials,
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal,
      })
      if (!response.ok) return null
      return retentionMode(await response.json())
    }, timeoutMs)
    if (savedRetention !== retention) {
      return { ok: false, failure: 'settings' }
    }
  } catch {
    return { ok: false, failure: 'settings' }
  }
  try {
    const connected = await withBridgeTimeout(async (signal) => {
      const response = await fetcher(`${baseUrl}/connect/session`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl: config.supabaseUrl,
          publishableKey: config.supabasePublishableKey,
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt: expiresAt * 1_000,
        }),
        cache: 'no-store',
        credentials,
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal,
      })
      if (!response.ok) return false
      const result: unknown = await response.json()
      return typeof result === 'object' && result !== null && Reflect.get(result, 'connected') === true
    }, timeoutMs)
    return connected
      ? { ok: true, retention }
      : { ok: false, failure: 'pairing' }
  } catch {
    return { ok: false, failure: 'pairing' }
  }
}
