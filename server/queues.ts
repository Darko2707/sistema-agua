import { Queue } from 'bullmq';

const redisUrl = new URL(process.env.REDIS_URL!);
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port),
  password: redisUrl.password,
  maxRetriesPerRequest: null,
};

export const ticketQueue = new Queue('tickets', { connection });
export const corteQueue = new Queue('cortes', { connection });