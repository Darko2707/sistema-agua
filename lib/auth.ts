import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/db';
import * as schema from '@/db/schema';

const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const authUrl = process.env.BETTER_AUTH_URL;
// VERCEL_URL is injected automatically on every Vercel deployment (production + previews).
// It contains only the hostname (no protocol), so we prepend https://.
const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;
const emailFrom = process.env.RESEND_FROM ?? 'Sistema de Agua <onboarding@resend.dev>';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendEmail(to: string, subject: string, html: string) {
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({ from: emailFrom, to, subject, html });
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: {
    enabled: true,
    resetPasswordTokenExpiresIn: 60 * 60 * 24,
    sendResetPassword: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
      await sendEmail(
        user.email,
        'Restablecer contrasena - Sistema de Agua',
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px;">
          <h1 style="color:#0ea5e9;">Restablecer contrasena</h1>
          <p>Hola <strong>${escapeHtml(user.name)}</strong>,</p>
          <p>Has solicitado restablecer tu contrasena. Haz clic en el siguiente enlace:</p>
          <div style="text-align:center;margin:30px 0;">
            <a href="${escapeHtml(url)}" style="background-color:#0ea5e9;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;">Restablecer contrasena</a>
          </div>
          <p style="font-size:14px;color:#666;">Este enlace expirara en <strong>24 horas</strong>.</p>
          <p style="font-size:14px;color:#666;">Si no solicitaste este cambio, ignora este correo.</p>
          <hr style="border:1px solid #eee;margin:20px 0;"/>
          <p style="font-size:12px;color:#999;">Sistema de Agua - Fraccionamiento</p>
        </div>`,
      );
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
      await sendEmail(
        user.email,
        'Verifica tu correo - Sistema de Agua',
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px;">
          <h1 style="color:#0ea5e9;">Verifica tu correo electronico</h1>
          <p>Hola <strong>${escapeHtml(user.name)}</strong>,</p>
          <p>Haz clic en el siguiente enlace para activar tu cuenta:</p>
          <div style="text-align:center;margin:30px 0;">
            <a href="${escapeHtml(url)}" style="background-color:#0ea5e9;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;">Verificar correo</a>
          </div>
          <p style="font-size:14px;color:#666;">Este enlace expirara en <strong>24 horas</strong>.</p>
          <p style="font-size:14px;color:#666;">Si no creaste esta cuenta, ignora este correo.</p>
          <hr style="border:1px solid #eee;margin:20px 0;"/>
          <p style="font-size:12px;color:#999;">Sistema de Agua - Fraccionamiento</p>
        </div>`,
      );
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
    'http://localhost:3000',
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
