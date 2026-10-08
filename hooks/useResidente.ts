import { trpcReact } from '@/lib/trpc-react';
import { useSession } from '@/hooks/useAuth';

// Perfil del residente autenticado + estado de agua
export function useResidenteActual() {
  const { data: session } = useSession();
  return trpcReact.usuarios.miPerfil.useQuery(undefined, {
    enabled: !!session,
  });
}

// Lista de residentes de un fraccionamiento (admin/rep).
export function useResidentesPorFraccionamiento(fraccionamientoId: string) {
  const query = trpcReact.usuarios.listarResidentes.useQuery({ fraccionamientoId }, {
    enabled: !!fraccionamientoId,
  });
  const data = query.data?.items ?? [];
  return { ...query, data };
}

// Mutations del ciclo de vida de agua (cuadrilla/admin)
export function useActualizarEstadoAgua() {
  const utils = trpcReact.useUtils();

  const onSuccess = () => {
    void utils.cortes.pendientesDeCorte.invalidate();
    void utils.cortes.pendientesDeReconexion.invalidate();
    void utils.usuarios.listarResidentes.invalidate();
  };

  const corte = trpcReact.cortes.confirmarCorte.useMutation({ onSuccess });
  const reconexion = trpcReact.cortes.confirmarReconexion.useMutation({ onSuccess });

  return {
    confirmarCorte: corte.mutateAsync,
    confirmarReconexion: reconexion.mutateAsync,
    isPending: corte.isPending || reconexion.isPending,
    error: corte.error ?? reconexion.error,
  };
}
