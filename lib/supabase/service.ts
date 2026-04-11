import { createClient } from '@supabase/supabase-js'
import { validateEnv } from '@/lib/env'

export function createServiceClient() {
  validateEnv()
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )
}
