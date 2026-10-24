import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { asignacionesFraccionamiento } from '@/db/schema';
import { requireSession } from '@/lib/session';
import { homePathForRole } from '@/lib/role-home';

export default async function TrabajadorLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  // Roles directamente autorizados para operaciones de cuadrilla
  if (session.user.role === 'cuadrilla_cortes' || session.user.role === 'admin') {
    return <>{children}</>;
  }

  // Verificar si el usuario cuenta con asignación operativa activa como cuadrilla
  const [asignacion] = await db.select({ id: asignacionesFraccionamiento.id })
    .from(asignacionesFraccionamiento)
    .where(and(
      eq(asignacionesFraccionamiento.usuarioId, session.user.id),
      eq(asignacionesFraccionamiento.rol, 'cuadrilla_cortes'),
      eq(asignacionesFraccionamiento.activo, true),
    ))
    .limit(1);

  if (asignacion) {
    return <>{children}</>;
  }

  redirect(homePathForRole(session.user.role));
}

