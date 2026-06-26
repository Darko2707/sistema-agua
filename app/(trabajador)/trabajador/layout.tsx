import { requireSession } from '@/lib/session';

export default async function TrabajadorLayout({ children }: { children: React.ReactNode }) {
  await requireSession({ roles: ['cuadrilla_cortes', 'admin'] });
  return <>{children}</>;
}
