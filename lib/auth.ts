import { APIError, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { logger } from '@/lib/logger';
import {
  esNombrePersonaValido,
  normalizarNombrePersona,
  NOMBRE_PERSONA_ERROR,
} from '@/src/domain/usuarios/nombre-persona';
import { hashAccountPassword, verifyAccountPassword } from '@/lib/password';

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
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: {
    enabled: true,
    password: {
      hash:   hashAccountPassword,
      verify: verifyAccountPassword,
    },
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
            where: (row, { and, eq: opEq, isNull }) => and(
              opEq(row.id, newSession.userId),
              isNull(row.deletedAt),
            ),
            columns: { id: true, role: true, fraccionamientoId: true },
          });
          if (!activeUser) {
            throw new APIError('FORBIDDEN', { message: 'Cuenta no disponible' });
          }
          if (activeUser.role !== 'admin' && activeUser.fraccionamientoId) {
            const fraccionamiento = await db.query.fraccionamientos.findFirst({
              where: (row, { eq: opEq }) => opEq(row.id, activeUser.fraccionamientoId!),
              columns: { activo: true },
            });
            if (!fraccionamiento?.activo) {
              throw new APIError('FORBIDDEN', { message: 'El fraccionamiento esta desactivado' });
            }
          }

          // HU-S4-01: Control de sesión única y anti-piratería
          const priorSessions = await db.query.session.findMany({
            where: (row, { eq: opEq }) => opEq(row.userId, newSession.userId),
          });

          const quinceMinutosAtras = new Date(Date.now() - 15 * 60 * 1000);
          for (const s of priorSessions) {
            if (s.ipAddress && newSession.ipAddress && s.ipAddress !== newSession.ipAddress) {
              const sesionReciente = s.createdAt >= quinceMinutosAtras;
              if (sesionReciente) {
                await db.insert(schema.auditoria).values({
                  actorId: newSession.userId,
                  accion: 'seguridad.alerta_sesion_concurrente',
                  entidad: 'session',
                  entidadId: s.id,
                  detalle: {
                    motivo: 'Inicio de sesion concurrente desde IP distinta en intervalo corto',
                    ipAnterior: s.ipAddress,
                    ipNueva: newSession.ipAddress,
                    userAgentAnterior: s.userAgent,
                    userAgentNuevo: newSession.userAgent,
                    tiempoTranscurridoSegundos: Math.round((Date.now() - s.createdAt.getTime()) / 1000),
                  },
                  ip: newSession.ipAddress,
                  userAgent: newSession.userAgent,
                });
                logger.warn('seguridad.alerta_sesion_concurrente', {
                  userId: newSession.userId,
                  ipAnterior: s.ipAddress,
                  ipNueva: newSession.ipAddress,
                });
              }
            }
          }

          if (priorSessions.length > 0) {
            await db.delete(schema.session).where(eq(schema.session.userId, newSession.userId));
          }

          await db.insert(schema.auditoria).values({
            actorId: newSession.userId,
            accion: 'auth.sesion_iniciada',
            entidad: 'session',
            entidadId: newSession.id,
            detalle: {
              ipAddress: newSession.ipAddress,
              userAgent: newSession.userAgent,
              sesionesPreviasInvalidadas: priorSessions.length,
            },
            ip: newSession.ipAddress,
            userAgent: newSession.userAgent,
          });
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: process.env.E2E_PLAYWRIGHT !== '1',
  },
  // BETTER_AUTH_URL must be set to the HTTPS production URL for SISCO.
  // so that Better Auth generates correct email links and enforces Secure cookies automatically.
  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production' && process.env.E2E_PLAYWRIGHT !== '1' && !authUrl?.startsWith('http://'),
    defaultCookieAttributes: {
      // 'lax' (not 'strict') so the session cookie is sent when Mercado Pago
      // redirects back to /residente?payment=success after a cross-site payment.
      // With 'strict' the cookie is silently dropped on that cross-site redirect.
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production' && process.env.E2E_PLAYWRIGHT !== '1' && !authUrl?.startsWith('http://'),
    },
  },
  trustedOrigins: [
    ...(process.env.NODE_ENV === 'development' || process.env.E2E_PLAYWRIGHT === '1' ? ['http://localhost:3000', 'http://localhost:3100'] : []),
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
