import { trpcReact } from '@/lib/trpc-react';
import { useIsRepresentante } from '@/hooks/useAuth';

// Representante: circuito propio (devuelve NOT_FOUND para otros roles)
export function useCircuitoActual() {
  const isRepresentante = useIsRepresentante();
  return trpcReact.circuitos.miCircuito.useQuery(undefined, {
    enabled: isRepresentante,
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
