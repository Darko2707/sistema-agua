import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export default async function ResidenteLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const role = session.user.role;

  // Roles que no tienen perfil de residente — mandar a su propio panel
  if (role === 'admin') redirect('/admin');
  if (role === 'tesorera') redirect('/tesorera');

  // residente, representante y cuadrilla_cortes pueden tener perfil de residente
  return <>{children}</>;
}
