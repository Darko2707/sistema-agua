import { db } from '@/db'
import { TRPCError } from '@trpc/server'

export function obtenerPeriodoVigente() {
  const ahora = new Date()
  const dia   = ahora.getDate()
  const mes   = ahora.getMonth() + 1
  const anio  = ahora.getFullYear()
  return { mes, anio, vencido: dia > 5 }
}

export function esMoroso(
  pagos: { mes: number; anio: number; estado: string }[],
  mes: number,
  anio: number
): boolean {
  const { vencido } = obtenerPeriodoVigente()
  if (!vencido) return false
  return !pagos.some(p => p.mes === mes && p.anio === anio && p.estado === 'pagado')
}

export async function verificarCircuitoActivo(userId: string) {
  const perfil = await db.query.perfilesResidente.findFirst({
    where: (p, { eq }) => eq(p.userId, userId),
    with: { circuito: true },
  })

  if (perfil?.circuito && !perfil.circuito.activo) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Tu circuito esta inhabilitado. Contacta al administrador.',
    })
  }

  return perfil
}
