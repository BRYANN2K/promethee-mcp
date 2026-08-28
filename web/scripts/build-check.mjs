import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const vite = resolve(process.cwd(), 'node_modules/vite/bin/vite.js')
const output = resolve(process.cwd(), '../.tmp/web-check-dist')
const result = spawnSync(process.execPath, [vite, 'build', '--outDir', output, '--emptyOutDir'], {
  env: {
    ...process.env,
    VITE_SUPABASE_URL: 'https://auth.promethee.io',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_build_only',
  },
  shell: false,
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exitCode = result.status ?? 1
