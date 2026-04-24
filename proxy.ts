import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Routes that handle their own auth — the proxy must NOT try to validate
  // the Supabase cookie here, otherwise external callers (bot, webhook
  // providers) get redirected to /login and their POST turns into a 405.
  // Every handler under /api/bot/ either uses verifyBotAuth (Bearer secret)
  // for bot-facing endpoints or getAuthUser (cookie) for dashboard-facing
  // ones; whichever is the right check runs inside the route, not here.
  if (
    pathname.startsWith('/api/webhook/') ||
    pathname.startsWith('/api/bot/') ||
    pathname.startsWith('/api/admin/')
  ) {
    return NextResponse.next()
  }

  // Build a response we can mutate cookies on
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the session — keeps the auth token alive
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isLoginPage = pathname === '/login'

  if (!user && !isLoginPage) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  if (user && isLoginPage) {
    const pipelineUrl = new URL('/pipeline', request.url)
    return NextResponse.redirect(pipelineUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
