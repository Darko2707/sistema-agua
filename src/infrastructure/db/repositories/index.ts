import { DrizzleResidenteRepository } from './drizzle-residente.repository';
import { DrizzlePagoRepository } from './drizzle-pago.repository';
import { DrizzleUserRepository } from './drizzle-user.repository';

export const residenteRepo = new DrizzleResidenteRepository();
export const pagoRepo      = new DrizzlePagoRepository();
export const userRepo      = new DrizzleUserRepository();
