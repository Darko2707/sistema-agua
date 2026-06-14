import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

const createDb = () => {
  const url = process.env.DATABASE_URL!
  return drizzle(neon(url), { schema })
}

let _db: ReturnType<typeof createDb> | null = null

export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_, prop) {
    if (!_db) _db = createDb()
    return (_db as any)[prop]
  }
})