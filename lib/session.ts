import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { userRepo } from '@/src/infrastructure/db/repositories';
import type { UserRole } from '@/src/application/ports/user.repository';

/**
 * Validates session and role for protected layouts.
 */
export async function requireSession(opts?: { roles?: UserRole[] }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) redirect('/login');

  const currentUser = await userRepo.findById(session.user.id);
  if (!currentUser) redirect('/login');

  if (opts?.roles && !opts.roles.includes(currentUser.role)) {
    redirect('/');
  }

  return {
    ...session,
    user: {
      ...session.user,
      name: currentUser.name,
      email: currentUser.email,
      role: currentUser.role,
    },
  };
}
