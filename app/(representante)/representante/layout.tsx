import { requireSession } from '@/lib/session';

export default async function RepresentanteLayout({ children }: { children: React.ReactNode }) {
  await requireSession({ roles: ['representante', 'admin'] });
  return <>{children}</>;
}
