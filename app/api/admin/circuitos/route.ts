import { db } from '@/db';
import { maskToken, requireAdmin, unauthorized } from '../_lib';

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return unauthorized();
  }

  const data = await db.query.circuitos.findMany({
    with: { representante: true },
    orderBy: (c, { asc }) => [asc(c.nombre)],
  });

  return Response.json({
    circuitos: data.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      representanteId: c.representanteId,
      montoReconexion: c.montoReconexion,
      representante: c.representante
        ? { id: c.representante.id, name: c.representante.name, email: c.representante.email }
        : null,
      montoMensual: c.montoMensual,
      mercadoPagoAccessToken: maskToken(c.mercadoPagoAccessToken),
      mercadoPagoCollectorId: c.mercadoPagoCollectorId,
    })),
  });
}
