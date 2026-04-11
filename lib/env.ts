/**
 * Runtime validation of critical environment variables.
 * Import this early to fail fast with clear error messages
 * instead of cryptic runtime failures.
 */

const REQUIRED_SERVER_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_KEY',
] as const

const WARN_IF_MISSING = [
  'ANTHROPIC_API_KEY',
  'EVOLUTION_API_URL',
  'EVOLUTION_INSTANCE',
  'EVOLUTION_API_KEY',
  'BOT_SERVER_URL',
] as const

let validated = false

export function validateEnv(): void {
  if (validated) return
  validated = true

  const missing: string[] = []
  for (const key of REQUIRED_SERVER_VARS) {
    if (!process.env[key]) missing.push(key)
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      'Check your .env.local file.',
    )
  }

  for (const key of WARN_IF_MISSING) {
    if (!process.env[key]) {
      console.warn(`[env] Warning: ${key} is not set — related features will be disabled`)
    }
  }
}
