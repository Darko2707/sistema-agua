import { headers } from 'next/headers';
import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { pagos, perfilesResidente } from '@/db/schema';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function requireRepresentante() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const usuario = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.id, session.user.id),
  });

  return usuario?.role === 'representante' || usuario?.role === 'admin' ? usuario : null;
}

export async function GET() {
  const usuario = await requireRepresentante();
  if (!usuario) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  const circuito = await db.query.circuitos.findFirst({
    where: (c, { eq }) => eq(c.representanteId, usuario.id),
  });

  if (!circuito) {
    return Response.json({ pagos: [], circuito: null });
  }

  if (usuario.role === 'representante' && !circuito.activo) {
    return Response.json(
      { error: 'Tu circuito esta inhabilitado. Contacta al administrador.' },
      { status: 403 },
    );
  }

  const data = await db
    .select({
      id: pagos.id,
      folio: pagos.folio,
      mes: pagos.mes,
      anio: pagos.anio,
      fechaPago: pagos.fechaPago,
      metodo: pagos.metodo,
      monto: pagos.monto,
      montoBase: pagos.montoBase,
      iva: pagos.iva,
      comisionMercadoPago: pagos.comisionMercadoPago,
      retencionIsr: pagos.retencionIsr,
      retencionIva: pagos.retencionIva,
      montoNetoRepresentante: pagos.montoNetoRepresentante,
      residenteNombre: perfilesResidente.edificio,
      departamento: perfilesResidente.departamento,
      edificio: perfilesResidente.edificio,
    })
    .from(pagos)
    .innerJoin(perfilesResidente, eq(pagos.perfilId, perfilesResidente.id))
    .where(eq(pagos.circuitoId, circuito.id))
    .orderBy(desc(pagos.fechaPago), desc(pagos.creadoEn));

  return Response.json({
    circuito: { id: circuito.id, nombre: circuito.nombre },
    pagos: data,
  });
}
