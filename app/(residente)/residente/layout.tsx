import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export default async function ResidenteLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const role = session.user.role;

  // Solo el admin no tiene perfil de residente — redirigir a su panel
  if (role === 'admin') redirect('/admin');

  // residente, representante, tesorera y cuadrilla_cortes pueden tener perfil de residente
  return <>{children}</>;
}
