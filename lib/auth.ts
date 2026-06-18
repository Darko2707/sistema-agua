import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/db';
import * as schema from '@/db/schema';

const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const authUrl = process.env.BETTER_AUTH_URL;
const emailFrom = process.env.RESEND_FROM ?? 'Sistema de Agua <onboarding@resend.dev>';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: {
    enabled: true,
    resetPasswordTokenExpiresIn: 60 * 60 * 24,
    sendResetPassword: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);

        await resend.emails.send({
          from: emailFrom,
          to: user.email,
          subject: 'Restablecer contrasena - Sistema de Agua',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
              <h1 style="color: #0ea5e9;">Restablecer contrasena</h1>
              <p>Hola <strong>${user.name}</strong>,</p>
              <p>Has solicitado restablecer tu contrasena. Haz clic en el siguiente enlace:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${url}" style="background-color: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  Restablecer contrasena
                </a>
              </div>
              <p style="font-size: 14px; color: #666;">Este enlace expirara en <strong>24 horas</strong>.</p>
              <p style="font-size: 14px; color: #666;">Si no solicitaste este cambio, ignora este correo.</p>
              <hr style="border: 1px solid #eee; margin: 20px 0;" />
              <p style="font-size: 12px; color: #999;">Sistema de Agua - Fraccionamiento</p>
            </div>
          `,
        });
      } catch (error) {
        console.error('Error enviando correo de recuperacion:', error);
        throw error;
      }
    },
  },
  trustedOrigins: [
    'https://sistema-agua.vercel.app',
    'http://localhost:3000',
    appUrl,
    authUrl,
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
