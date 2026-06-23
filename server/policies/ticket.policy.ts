import { TRPCError } from '@trpc/server';

type TicketActor = { id: string; role?: string };
type TicketContext = {
  ownerUserId: string;
  circuitoRepresentanteId: string | null;
};

export function puedeVerTicket(actor: TicketActor, ctx: TicketContext): void {
  const rol = actor.role ?? 'residente';
  if (rol === 'admin') return;
  if (rol === 'representante' && ctx.circuitoRepresentanteId === actor.id) return;
  if (ctx.ownerUserId === actor.id) return;
  throw new TRPCError({ code: 'FORBIDDEN', message: 'Sin acceso a este ticket' });
}
