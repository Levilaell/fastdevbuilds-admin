import { createClient } from './server'

/**
 * Verify the caller is authenticated via Supabase session cookies.
 * Returns the user object or null. Use in API routes that bypass RLS
 * (i.e. routes using createServiceClient) to ensure the caller is legit.
 */
export async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/** Standard 401 response for unauthenticated API calls. */
export function unauthorizedResponse() {
  return Response.json({ error: 'Não autenticado' }, { status: 401 })
}
