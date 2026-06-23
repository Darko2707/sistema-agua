import { TRPCError } from '@trpc/server';

type PagoActor = { id: string; role?: string };
type Perfil    = { userId: string; circuitoId: string };
type Circuito  = { id: string; representanteId: string | null; activo: boolean };

export function puedeRegistrarPago(actor: PagoActor, perfil: Perfil, circuito: Circuito): void {
  if (!circuito.activo) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'El circuito está inhabilitado' });
  }

  const rol = actor.role ?? 'residente';

  if (rol === 'representante' && circuito.representanteId !== actor.id) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Este residente no pertenece a tu circuito' });
  }

  if (rol === 'residente' && perfil.userId !== actor.id) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'No puedes registrar pagos de otros residentes' });
  }
}

export function puedeVerHistorial(actor: PagoActor, perfil: Perfil, circuito: Circuito): void {
  const rol = actor.role ?? 'residente';
  if (rol === 'admin') return;
  if (rol === 'representante' && circuito.representanteId === actor.id) return;
  if (perfil.userId === actor.id) return;
  throw new TRPCError({ code: 'FORBIDDEN', message: 'Sin acceso al historial de este residente' });
}
