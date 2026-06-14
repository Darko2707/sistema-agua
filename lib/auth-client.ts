'use client'

import { createAuthClient } from 'better-auth/client'
import { useState, useEffect } from 'react'

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
})

type SessionData = {
  user: {
    id: string
    name: string
    email: string
    role?: string
  }
} | null

export function useSession() {
  const [data, setData]           = useState<SessionData>(null)
  const [isPending, setIsPending] = useState(true)

  useEffect(() => {
    let active = true
    authClient.getSession().then((res: any) => {
      if (active) {
        setData(res?.data ?? null)
        setIsPending(false)
      }
    })
    return () => { active = false }
  }, [])

  return { data, isPending }
}