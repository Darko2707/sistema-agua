import { db } from '@/db'
import { circuitos } from '@/db/schema'

export async function GET() {
  const data = await db.select().from(circuitos)
  return Response.json(data)
}