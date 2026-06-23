import { useSession as useBetterAuthSession } from '@/lib/auth-client';
import { trpcReact } from '@/lib/trpc-react';

export function useSession() {
  return useBetterAuthSession();
}

export function useCurrentUser() {
  const { data: session } = useSession();
  return trpcReact.usuarios.miPerfil.useQuery(undefined, {
    enabled: !!session,
  });
}

export function useIsAdmin() {
  const { data } = useSession();
  return data?.user?.role === 'admin';
}

export function useIsRepresentante() {
  const { data } = useSession();
  return data?.user?.role === 'representante';
}

export function useIsResidente() {
  const { data } = useSession();
  return data?.user?.role === 'residente';
}
