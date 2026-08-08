import { router } from '../trpc'
import { pagosRouter }    from './pagos'
import { cortesRouter }   from './cortes'
import { ticketsRouter }  from './tickets'
import { usuariosRouter } from './usuarios'
import { circuitosRouter } from './circuitos'
import { reportesRouter } from './reportes'
import { operacionRouter } from './operacion'

export const appRouter = router({
  pagos:     pagosRouter,
  cortes:    cortesRouter,
  tickets:   ticketsRouter,
  usuarios:  usuariosRouter,
  circuitos: circuitosRouter,
  reportes:  reportesRouter,
  operacion: operacionRouter,
})

export type AppRouter = typeof appRouter
