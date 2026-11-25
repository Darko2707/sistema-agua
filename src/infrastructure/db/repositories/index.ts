import { DrizzleResidenteRepository } from './drizzle-residente.repository';
import { DrizzlePagoRepository } from './drizzle-pago.repository';
import { DrizzleUserRepository } from './drizzle-user.repository';
import { DrizzleDonativoRepository } from './drizzle-donativo.repository';
import { DrizzleTicketRepository } from './drizzle-ticket.repository';
import { DrizzleNotasOperativasRepository, notasOperativasRepo } from './drizzle-notas-operativas.repository';

export const residenteRepo = new DrizzleResidenteRepository();
export const pagoRepo      = new DrizzlePagoRepository();
export const userRepo      = new DrizzleUserRepository();
export const donativoRepo  = new DrizzleDonativoRepository();
export const ticketRepo    = new DrizzleTicketRepository();
export { DrizzleNotasOperativasRepository, notasOperativasRepo };
