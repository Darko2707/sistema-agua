import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/db';
import * as schema from '@/db/schema'; // Ajusta la ruta a tu archivo de esquema

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: true },
  trustedOrigins: [
    process.env.BETTER_AUTH_URL ?? 'https://sistema-agua-itfw4twbz-darko-s-projects5.vercel.app',
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://sistema-agua-itfw4twbz-darko-s-projects5.vercel.app',
  ],
});