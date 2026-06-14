import { Queue } from 'bullmq'

// Use connection options instead of an ioredis instance to avoid duplicate ioredis type conflicts
const connection = { url: process.env.REDIS_URL!, maxRetriesPerRequest: null } as any

export const ticketQueue = new Queue('tickets', { connection })
export const corteQueue  = new Queue('cortes',  { connection })

