import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/db';
import * as schema from '@/db/schema';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: {
    enabled: true,
    resetPassword: {
      enabled: true,
      expiresIn: 24,
    },
  },
  trustedOrigins: [
    'https://sistema-agua.vercel.app',
    'http://localhost:3000',
  ],
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
  // ✅ Configurar envío de correos con tipos explícitos
  email: {
    from: 'Sistema de Agua <contactoservicio4soles@gmail.com>',
    sendResetPassword: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        
        await resend.emails.send({
          from: 'Sistema de Agua <contactoservicio4soles@gmail.com>',
          to: user.email,
          subject: 'Restablecer contraseña - Sistema de Agua',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
              <h1 style="color: #0ea5e9;">🔄 Restablecer contraseña</h1>
              <p>Hola <strong>${user.name}</strong>,</p>
              <p>Has solicitado restablecer tu contraseña. Haz clic en el siguiente enlace:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${url}" style="background-color: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  Restablecer contraseña
                </a>
              </div>
              <p style="font-size: 14px; color: #666;">Este enlace expirará en <strong>24 horas</strong>.</p>
              <p style="font-size: 14px; color: #666;">Si no solicitaste este cambio, ignora este correo.</p>
              <hr style="border: 1px solid #eee; margin: 20px 0;" />
              <p style="font-size: 12px; color: #999;">Sistema de Agua - Fraccionamiento</p>
            </div>
          `,
        });
      } catch (error) {
        console.error('Error enviando correo de recuperación:', error);
        throw error;
      }
    },
  },
});