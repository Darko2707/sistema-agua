import { useState } from 'react';
import { trpcReact } from '@/lib/trpc-react';
import { useSession } from '@/hooks/useAuth';

// Historial del residente autenticado (para la página /residente)
export function useMiHistorial() {
  const { data: session } = useSession();
  return trpcReact.pagos.miHistorial.useQuery(undefined, { enabled: !!session });
}

// Historial del usuario actual (sin arg) o de un residente específico (con perfilId, admin/rep)
export function useHistorialPagos(perfilId?: string) {
  const { data: session } = useSession();

  // Siempre llamar ambos hooks para no violar las reglas de hooks
  const propio = trpcReact.pagos.miHistorial.useQuery(undefined, {
    enabled: perfilId === undefined && !!session,
  });

  const dePerfil = trpcReact.pagos.historialDe.useQuery(
    { perfilId: perfilId ?? '' },
    { enabled: !!perfilId },
  );

  return perfilId !== undefined ? dePerfil : propio;
}

// Representante: registrar pago en efectivo / transferencia por un residente
export function usePagar() {
  const utils = trpcReact.useUtils();
  return trpcReact.pagos.registrarManual.useMutation({
    onSuccess: (_data, variables) => {
      void utils.pagos.historialDe.invalidate({ perfilId: variables.perfilId });
      void utils.usuarios.listarResidentes.invalidate();
      void utils.pagos.resumenMes.invalidate();
    },
  });
}

// Pagos de un circuito filtrados por mes / año (representante o admin)
export function usePagosPorCircuito(input: {
  circuitoId?: string;
  mes?: number;
  anio?: number;
}) {
  return trpcReact.pagos.pagosPorCircuito.useQuery(input);
}

// Residente: iniciar cobro vía Mercado Pago (redirige, no es tRPC)
export function useCheckoutMP() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkout(esReconexion: boolean) {
    setIsPending(true);
    setError(null);
    try {
      const res = await fetch('/api/mercadopago/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ esReconexion }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar el pago');
      window.location.href = data.url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar el pago');
      setIsPending(false);
    }
  }

  return { checkout, isPending, error };
}
