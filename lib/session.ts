import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

/**
 * Validates session, role, and account verification for protected layouts.
 * Admin is exempt because it is created manually by the system owner.
 */
export async function requireSession(opts?: { roles?: string[] }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) redirect('/login');

  const { user } = session;

  if (opts?.roles && !opts.roles.includes(user.role as string)) {
    redirect('/');
  }

  if (user.role !== 'admin' && !user.emailVerified) {
    redirect('/verificar-email');
  }

  return session;
}
