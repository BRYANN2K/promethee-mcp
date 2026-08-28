import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const environmentHasConfig =
  typeof process.env.VITE_SUPABASE_URL === 'string' &&
  process.env.VITE_SUPABASE_URL.length > 0 &&
  typeof process.env.VITE_SUPABASE_PUBLISHABLE_KEY === 'string' &&
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY.length > 0

const viteEnvironmentFileExists = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
].some((file) => existsSync(resolve(process.cwd(), file)))

if (!environmentHasConfig && !viteEnvironmentFileExists) {
  process.stderr.write(
    'Refusing to replace web/dist with an unconfigured login. Set the browser-safe VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, or provide an ignored Vite environment file.\n',
  )
  process.exitCode = 2
}
