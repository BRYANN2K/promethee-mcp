import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { PublicConfig } from '../config/public-config.ts'

export const BROWSER_AUTH_STORAGE_KEY = 'promethee-mcp-auth'

export function createBrowserAuthClient(config: PublicConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: 'pkce',
      persistSession: true,
      storage: window.sessionStorage,
      storageKey: BROWSER_AUTH_STORAGE_KEY,
    },
    global: {
      headers: {
        'X-Client-Info': 'promethee-mcp-auth-web/0.1.0',
      },
    },
  })
}
