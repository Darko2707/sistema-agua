import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { residenteRepo } from '@/src/infrastructure/db/repositories';
import { PushNotificationManager } from '@/components/push/PushNotificationManager';

export default async function ResidenteLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  // Solo el admin no tiene perfil de residente — redirigir a su panel
  if (session.user.role === 'admin') redirect('/admin');

  if (session.user.role === 'residente') {
    const perfil = await residenteRepo.findByUserId(session.user.id);
    if (!perfil) redirect('/registro');
  }

  return (
    <>
      {children}
      <PushNotificationManager />
    </>
  );
}
