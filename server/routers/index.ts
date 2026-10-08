import { router } from '../trpc'
import { pagosRouter }    from './pagos'
import { cortesRouter }   from './cortes'
import { ticketsRouter }  from './tickets'
import { usuariosRouter } from './usuarios'
import { reportesRouter } from './reportes'
import { operacionRouter } from './operacion'
import { suscripcionesRouter } from './suscripciones'
import { serviciosRouter } from './servicios'
import { fraccionamientosRouter } from './fraccionamientos'

export const appRouter = router({
  pagos:     pagosRouter,
  cortes:    cortesRouter,
  tickets:   ticketsRouter,
  usuarios:  usuariosRouter,
  reportes:  reportesRouter,
  operacion: operacionRouter,
  suscripciones: suscripcionesRouter,
  servicios: serviciosRouter,
  fraccionamientos: fraccionamientosRouter,
})

export type AppRouter = typeof appRouter
