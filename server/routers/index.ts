import { router } from '../trpc'
import { pagosRouter }    from './pagos'
import { cortesRouter }   from './cortes'
import { ticketsRouter }  from './tickets'
import { usuariosRouter } from './usuarios'

export const appRouter = router({
  pagos:    pagosRouter,
  cortes:   cortesRouter,
  tickets:  ticketsRouter,
  usuarios: usuariosRouter,
})

export type AppRouter = typeof appRouter