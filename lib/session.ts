import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

/**
 * Validates session, role, and email verification for protected layouts.
 * Admin is exempt from email verification (created manually by system owner).
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
