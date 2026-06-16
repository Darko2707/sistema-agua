import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { user } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Resend } from 'resend';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    // Verificar que el usuario existe
    const usuario = await db.query.user.findFirst({
      where: (u, { eq }) => eq(u.email, email),
    });

    if (!usuario) {
      return NextResponse.json(
        { error: 'No existe una cuenta con este correo' },
        { status: 404 }
      );
    }

    // Generar token (guardar en una tabla de tokens o usar el sistema de better-auth)
    const token = nanoid(32);
    // Guardar token en la base de datos (necesitarías una tabla de tokens)
    // ... implementar guardado de token

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;

    await resend.emails.send({
      from: 'Sistema de Agua <contactoservicio4soles@gmail.com>',
      to: email,
      subject: 'Restablecer contraseña - Sistema de Agua',
      html: `
        <h1>Restablecer contraseña</h1>
        <p>Haz clic en el siguiente enlace para restablecer tu contraseña:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>Este enlace expirará en 24 horas.</p>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error en reset password:', error);
    return NextResponse.json(
      { error: 'Error al enviar el correo' },
      { status: 500 }
    );
  }
}