import { router } from '../trpc'
import { pagosRouter }    from './pagos'
import { cortesRouter }   from './cortes'
import { ticketsRouter }  from './tickets'
import { usuariosRouter } from './usuarios'
import { circuitosRouter } from './circuitos'
import { reportesRouter } from './reportes'

export const appRouter = router({
  pagos:     pagosRouter,
  cortes:    cortesRouter,
  tickets:   ticketsRouter,
  usuarios:  usuariosRouter,
  circuitos: circuitosRouter,
  reportes:  reportesRouter,
})

export type AppRouter = typeof appRouter