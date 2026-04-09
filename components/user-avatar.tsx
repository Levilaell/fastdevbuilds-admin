'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function UserAvatar() {
  const [initial, setInitial] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? ''
      setInitial(email.charAt(0).toUpperCase())
    })
  }, [])

  if (!initial) return null

  return (
    <div className="w-8 h-8 rounded-full bg-accent/15 text-accent flex items-center justify-center text-sm font-semibold border border-accent/20">
      {initial}
    </div>
  )
}
