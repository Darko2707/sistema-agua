import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { residenteRepo } from '@/src/infrastructure/db/repositories';
import { homePathForRole } from '@/lib/role-home';
import { PushNotificationManager } from '@/components/push/PushNotificationManager';

const ROLES_ADMIN_O_TRABAJADOR = new Set(['admin', 'representante', 'tesorera', 'cuadrilla_cortes']);

export default async function ResidenteLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  // Si no cuenta con perfil de residente activo:
  // - Si su rol es residente (sin roles admin ni operativos), redirigir a completar registro de vivienda
  // - Si cuenta con rol administrativo/operativo (o multi-rol), se le permite el acceso a /residente
  //   para visualizar el estado informativo / vacío de residencia con opción de volver a su panel
  // - Si es un rol no autorizado o no reconocido, redirigir a su home correspondiente
  const perfil = await residenteRepo.findByUserId(session.user.id);
  if (!perfil) {
    const userRole = session.user.role;
    const userRoles = session.user.roles ?? [];
    const esAdminOperativo = ROLES_ADMIN_O_TRABAJADOR.has(userRole) || userRoles.some(r => ROLES_ADMIN_O_TRABAJADOR.has(r));

    if (esAdminOperativo) {
      return (
        <>
          {children}
          <PushNotificationManager />
        </>
      );
    }

    if (userRole === 'residente') {
      redirect('/registro');
    }

    redirect(homePathForRole(userRole));
  }

  return (
    <>
      {children}
      <PushNotificationManager />
    </>
  );
}
