import { auth } from '@/lib/auth'
import { db } from '@/db'
import { user } from '@/db/schema'
import { verificarAccesoPorCircuito } from '@/server/utils'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return Response.json({ role: null }, { status: 401 })

  const [u] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, session.user.id))

  const role = u?.role ?? 'residente'

  try {
    await verificarAccesoPorCircuito(session.user.id, role)
  } catch {
    return Response.json(
      { role, error: 'Tu circuito esta inhabilitado. Contacta al administrador.' },
      { status: 403 },
    )
  }

  return Response.json({ role })
}
