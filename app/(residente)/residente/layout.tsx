import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { residenteRepo } from '@/src/infrastructure/db/repositories';
import { homePathForRole } from '@/lib/role-home';
import { PushNotificationManager } from '@/components/push/PushNotificationManager';

export default async function ResidenteLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  // Si no cuenta con perfil de residente activo:
  // - Si su rol es residente, redirigir a completar registro de vivienda
  // - Si es un rol administrativo/operativo sin perfil de residente, redirigir a su panel autorizado
  const perfil = await residenteRepo.findByUserId(session.user.id);
  if (!perfil) {
    if (session.user.role === 'residente') {
      redirect('/registro');
    }
    redirect(homePathForRole(session.user.role));
  }

  return (
    <>
      {children}
      <PushNotificationManager />
    </>
  );
}
