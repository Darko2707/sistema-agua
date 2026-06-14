import { db } from '@/db'
import { pagos, cortes, departamentos } from '@/db/schema'
import { and, eq, notInArray } from 'drizzle-orm'

export async function GET(req: Request) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return new Response('Unauthorized', { status: 401 })

  const now  = new Date()
  const mes  = now.getMonth() === 0 ? 12 : now.getMonth()
  const anio = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

  const pagados = db.select({ id: pagos.departamentoId }).from(pagos)
    .where(and(eq(pagos.mes, mes), eq(pagos.anio, anio), eq(pagos.estado, 'pagado')))

  const morosos = await db.select().from(departamentos)
    .where(notInArray(departamentos.id, pagados))

  for (const d of morosos)
    await db.insert(cortes).values({ departamentoId: d.id, motivo: 'falta_pago' })

  return Response.json({ cortados: morosos.length })
}