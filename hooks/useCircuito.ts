import { trpcReact } from '@/lib/trpc-react';
import { useIsRepresentante, useSession } from '@/hooks/useAuth';

// Representante: circuito propio (devuelve NOT_FOUND para otros roles)
export function useCircuitoActual() {
  const isRepresentante = useIsRepresentante();
  return trpcReact.circuitos.miCircuito.useQuery(undefined, {
    enabled: isRepresentante,
  });
}

// Tesorera: circuito propio por tesoreraId
export function useCircuitoTesorera() {
  const { data: session } = useSession();
  const isTesorera = session?.user?.role === 'tesorera';
  return trpcReact.circuitos.miCircuitoTesorera.useQuery(undefined, {
    enabled: isTesorera,
  });
}

// Todos los circuitos (cualquier usuario autenticado)
export function useCircuitos() {
  return trpcReact.usuarios.listarCircuitos.useQuery();
}

// Circuito asignado a un representante específico (filtra localmente)
export function useCircuitosPorRepresentante(representanteId: string) {
  const query = trpcReact.usuarios.listarCircuitos.useQuery(undefined, {
    enabled: !!representanteId,
  });
  const circuito = query.data?.find((c) => c.representanteId === representanteId) ?? null;
  return { ...query, data: circuito };
}
