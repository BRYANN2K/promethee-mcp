import './styles/tokens.css'
import './styles/app.css'

import { resolvePersonalBridgeUrl } from './auth/personal-bridge.ts'
import { createBrowserAuthClient } from './auth/supabase-client.ts'
import { parsePublicConfig } from './config/public-config.ts'
import { renderConfigurationBlocked, renderConsentBlocked } from './routes/blocking.ts'
import { renderConsent } from './routes/consent.ts'
import { renderLogin } from './routes/login.ts'
import { isLoopbackDevelopment } from './security/navigation.ts'

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('Application root is missing')

const config = parsePublicConfig(import.meta.env)
if (!config.ok) {
  renderConfigurationBlocked(root)
} else if (window.location.pathname === '/login' || window.location.pathname === '/') {
  const loopbackDevelopment = isLoopbackDevelopment(import.meta.env.DEV, new URL(window.location.href))
  const bridgeBaseUrl = resolvePersonalBridgeUrl(
    import.meta.env.VITE_MCP_BASE_URL,
    loopbackDevelopment,
    new URL(window.location.href),
  )
  if (bridgeBaseUrl === null) {
    renderConfigurationBlocked(root)
  } else {
    renderLogin(root, createBrowserAuthClient(config.value), {
      allowDirectConnection: true,
      personalBridge: {
        baseUrl: bridgeBaseUrl,
        supabaseUrl: config.value.supabaseUrl,
        supabasePublishableKey: config.value.supabasePublishableKey,
      },
    })
  }
} else if (window.location.pathname === '/oauth/consent') {
  renderConsent(root, createBrowserAuthClient(config.value))
} else {
  renderConsentBlocked(root)
}
