import { initTRPC, TRPCError } from '@trpc/server'
import { auth } from '@/lib/auth'

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth.api.getSession({ headers: opts.headers })
  return { user: session?.user ?? null }
}

const t = initTRPC.context<typeof createTRPCContext>().create()

export const router          = t.router
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { user: ctx.user } })
})

export function roleProcedure(...roles: string[]) {
  return protectedProcedure.use(({ ctx, next }) => {
    const userRole = (ctx.user as any).role
    if (!roles.includes(userRole)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes permisos para esto' })
    }
    return next({ ctx })
  })
}