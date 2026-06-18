import { db } from '@/db';
import { TRPCError } from '@trpc/server';

export async function verificarCircuitoActivo(userId: string) {
  const perfil = await db.query.perfilesResidente.findFirst({
    where: (p, { eq }) => eq(p.userId, userId),
    with: { circuito: true },
  });
  
  if (perfil?.circuito && !perfil.circuito.activo) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Tu circuito está inhabilitado. Contacta al administrador.',
    });
  }
  
  return perfil;
}