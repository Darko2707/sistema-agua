import { APIError, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/db';
import * as schema from '@/db/schema';
import {
  esNombrePersonaValido,
  normalizarNombrePersona,
  NOMBRE_PERSONA_ERROR,
} from '@/src/domain/usuarios/nombre-persona';

const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const authUrl = process.env.BETTER_AUTH_URL;
// VERCEL_URL is injected automatically on every Vercel deployment (production + previews).
// It contains only the hostname (no protocol), so we prepend https://.
const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;

function nombreCuentaValido(value: unknown): string {
  if (typeof value !== 'string' || !esNombrePersonaValido(value)) {
    throw new APIError('BAD_REQUEST', { message: NOMBRE_PERSONA_ERROR });
  }
  return normalizarNombrePersona(value);
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: {
    enabled: true,
  },
  databaseHooks: {
    user: {
      create: {
        async before(newUser) {
          return {
            data: {
              ...newUser,
              name: nombreCuentaValido(newUser.name),
            },
          };
        },
      },
      update: {
        async before(userUpdate) {
          if (userUpdate.name === undefined) return;
          return {
            data: {
              ...userUpdate,
              name: nombreCuentaValido(userUpdate.name),
            },
          };
        },
      },
    },
    session: {
      create: {
        async before(newSession) {
          const activeUser = await db.query.user.findFirst({
            where: (row, { and, eq, isNull }) => and(
              eq(row.id, newSession.userId),
              isNull(row.deletedAt),
            ),
            columns: { id: true },
          });
          if (!activeUser) {
            throw new APIError('FORBIDDEN', { message: 'Cuenta no disponible' });
          }
        },
      },
    },
  },
  // BETTER_AUTH_URL must be set to the HTTPS production URL (e.g. https://sistema-agua.vercel.app)
  // so that Better Auth generates correct email links and enforces Secure cookies automatically.
  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
    defaultCookieAttributes: {
      // 'lax' (not 'strict') so the session cookie is sent when Mercado Pago
      // redirects back to /residente?payment=success after a cross-site payment.
      // With 'strict' the cookie is silently dropped on that cross-site redirect.
      sameSite: 'lax',
    },
  },
  trustedOrigins: [
    'https://sistema-agua.vercel.app',
    ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000'] : []),
    appUrl,
    authUrl,
    vercelUrl,
  ].filter(Boolean) as string[],
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'residente',
        input: false,
      },
    },
  },
});
