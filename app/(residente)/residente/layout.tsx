import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';

export default async function ResidenteLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  // Solo el admin no tiene perfil de residente — redirigir a su panel
  if (session.user.role === 'admin') redirect('/admin');

  return <>{children}</>;
}
