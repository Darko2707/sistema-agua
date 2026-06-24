import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export default async function TesoreraLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  if (session.user.role !== 'tesorera' && session.user.role !== 'admin') redirect('/');
  return <>{children}</>;
}
