import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { circuitos, user } from '@/db/schema';
import { auth } from '@/lib/auth';
import { maskToken, requireAdmin, unauthorized } from '../_lib';

export const dynamic = 'force-dynamic';

const representanteSchema = z.object({
  nombre: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(8),
  circuitoId: z.string().uuid().nullable().optional(),
  mercadoPagoAccessToken: z.string().trim().min(1).optional(),
  mercadoPagoCollectorId: z.string().trim().min(1).optional(),
});

async function enviarCredenciales(input: {
  nombre: string;
  email: string;
  password: string;
  circuitoNombre?: string;
}) {
  if (!process.env.RESEND_API_KEY) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? '';
  const loginUrl = `${appUrl.replace(/\/$/, '')}/login`;
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  await resend.emails.send({
    from: process.env.RESEND_FROM ?? 'Sistema de Agua <onboarding@resend.dev>',
    to: input.email,
    subject: 'Acceso como representante - Sistema de Agua',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 20px;">
        <h1 style="color:#0ea5e9;">Bienvenido al Sistema de Agua</h1>
        <p>Hola <strong>${input.nombre}</strong>,</p>
        <p>Se creó tu cuenta como representante${input.circuitoNombre ? ` del circuito <strong>${input.circuitoNombre}</strong>` : ''}.</p>
        <p><strong>Correo:</strong> ${input.email}</p>
        <p><strong>Contraseña temporal:</strong> ${input.password}</p>
        <p>Inicia sesión aquí: <a href="${loginUrl}">${loginUrl}</a></p>
        <p>Después de entrar podrás revisar tus reportes de pagos desde el panel de representante.</p>
      </div>
    `,
  });
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const representantes = await db.query.user.findMany({
    where: (u, { eq }) => eq(u.role, 'representante'),
    orderBy: (u, { asc }) => [asc(u.name)],
  });

  const circuitosData = await db.query.circuitos.findMany({
    with: { representante: true },
    orderBy: (c, { asc }) => [asc(c.nombre)],
  });

  return Response.json({
    representantes: representantes.map((representante) => {
      const circuito = circuitosData.find((c) => c.representanteId === representante.id);
      return {
        id: representante.id,
        name: representante.name,
        email: representante.email,
        circuito: circuito
          ? {
              id: circuito.id,
              nombre: circuito.nombre,
              mercadoPagoAccessToken: maskToken(circuito.mercadoPagoAccessToken),
              mercadoPagoCollectorId: circuito.mercadoPagoCollectorId,
            }
          : null,
      };
    }),
  });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const body = representanteSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: 'Solicitud invalida' }, { status: 400 });
  }

  const existente = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.email, body.data.email),
  });
  if (existente) {
    return Response.json({ error: 'Ya existe un usuario con ese correo' }, { status: 409 });
  }

  const result = await auth.api.signUpEmail({
    body: {
      name: body.data.nombre,
      email: body.data.email,
      password: body.data.password,
    },
  });

  const nuevoUsuarioId = result.user.id;

  await db.transaction(async (tx) => {
    await tx.update(user).set({ role: 'representante' }).where(eq(user.id, nuevoUsuarioId));

    if (body.data.circuitoId) {
      await tx
        .update(circuitos)
        .set({
          representanteId: nuevoUsuarioId,
          mercadoPagoAccessToken: body.data.mercadoPagoAccessToken,
          mercadoPagoCollectorId: body.data.mercadoPagoCollectorId,
        })
        .where(eq(circuitos.id, body.data.circuitoId));
    }
  });

  const circuito = body.data.circuitoId
    ? await db.query.circuitos.findFirst({
        where: (c, { eq }) => eq(c.id, body.data.circuitoId as string),
      })
    : null;

  await enviarCredenciales({
    nombre: body.data.nombre,
    email: body.data.email,
    password: body.data.password,
    circuitoNombre: circuito?.nombre,
  }).catch((error) => {
    console.error('Error enviando credenciales de representante:', error);
  });

  return Response.json({ ok: true, id: nuevoUsuarioId }, { status: 201 });
}
