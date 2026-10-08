import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { homePathForRole } from '@/lib/role-home';
import { userRepo } from '@/src/infrastructure/db/repositories';
import type { UserRole } from '@/src/application/ports/user.repository';
import { db } from '@/db';
import { fraccionamientos } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Validates session and role for protected layouts.
 */
export async function requireSession(opts?: { roles?: UserRole[] }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) redirect('/login');

  const currentUser = await userRepo.findById(session.user.id);
  if (!currentUser) redirect('/login');

  // La sesión siempre vuelve a leer el ámbito desde la base, no desde una
  // cookie. Así un cambio de fraccionamiento o una desactivación toma efecto
  // también en páginas renderizadas en servidor.
  if (currentUser.role !== 'admin') {
    if (!currentUser.fraccionamientoId) redirect('/acceso-no-configurado');
    const [fraccionamiento] = await db.select({ activo: fraccionamientos.activo })
      .from(fraccionamientos)
      .where(eq(fraccionamientos.id, currentUser.fraccionamientoId))
      .limit(1);
    if (!fraccionamiento?.activo) redirect('/login');
  }

  if (opts?.roles && !opts.roles.includes(currentUser.role)) {
    redirect(homePathForRole(currentUser.role));
  }

  return {
    ...session,
    user: {
      ...session.user,
      name: currentUser.name,
      email: currentUser.email,
      role: currentUser.role,
      fraccionamientoId: currentUser.fraccionamientoId ?? null,
    },
  };
}
