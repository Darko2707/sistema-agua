import { auth } from '@/lib/auth'
import { db } from '@/db'
import { user } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return Response.json({ role: null }, { status: 401 })

  const [u] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, session.user.id))

  return Response.json({ role: u?.role ?? 'residente' })
}