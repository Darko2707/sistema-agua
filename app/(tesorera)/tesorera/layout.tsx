import { requireSession } from '@/lib/session';

export default async function TesoreraLayout({ children }: { children: React.ReactNode }) {
  await requireSession({ roles: ['tesorera'] });
  return <>{children}</>;
}
