import { router, roleProcedure } from '../trpc';
import { z } from 'zod';
// eslint-disable-next-line no-restricted-imports -- complex financial aggregations not yet in a repo
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

// eslint-disable-next-line no-restricted-imports -- complex financial aggregations not yet in a repo
import { db } from '@/db';
// eslint-disable-next-line no-restricted-imports -- complex financial aggregations not yet in a repo
import { gastosCircuito, ingresosAdicionales, circuitos } from '@/db/schema';

// ─── helpers ───────────────────────────────────────────────────────────────

// Edif. 8 < Edif. 10; dentro del edificio: 314a, 315a, 314b, 315b, 314c, 315c
function parsarDepto(depto: string): { letra: string; numero: number } {
  const m = depto.match(/^(\d+)([a-zA-Z]?)$/);
  if (m) return { numero: parseInt(m[1], 10), letra: m[2].toLowerCase() };
  return { numero: 0, letra: depto.toLowerCase() };
}

function sortPorEdificio<T extends { edificio: string; departamento: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const ea = parseInt(a.edificio, 10), eb = parseInt(b.edificio, 10);
    const edifCmp = isNaN(ea) || isNaN(eb) ? a.edificio.localeCompare(b.edificio) : ea - eb;
    if (edifCmp !== 0) return edifCmp;
    const da = parsarDepto(a.departamento), db = parsarDepto(b.departamento);
    if (da.letra !== db.letra) return da.letra.localeCompare(db.letra);
    return da.numero - db.numero;
  });
}

function ultimos12Meses(): { mes: number; anio: number }[] {
  const hoy = new Date();
  const periodos: { mes: number; anio: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    periodos.push({ mes: d.getMonth() + 1, anio: d.getFullYear() });
  }
  return periodos;
}

async function getCircuitoDelTesorera(userId: string) {
  // Ruta principal: circuito con tesoreraId asignado
  const byId = await db.query.circuitos.findFirst({
    where: (c, { eq }) => eq(c.tesoreraId, userId),
  });
  if (byId) return byId;

  // Fallback: buscar por perfilesResidente (datos previos al fix de tesoreraId)
  const perfil = await db.query.perfilesResidente.findFirst({
    where: (p, { eq }) => eq(p.userId, userId),
  });
  if (!perfil?.circuitoId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes un circuito asignado.' });
  }
  const byPerfil = await db.query.circuitos.findFirst({
    where: (c, { eq }) => eq(c.id, perfil.circuitoId!),
  });
  if (!byPerfil) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes un circuito asignado.' });
  }
  // Sincronizar tesoreraId para evitar el fallback en consultas futuras
  await db.update(circuitos).set({ tesoreraId: userId }).where(eq(circuitos.id, byPerfil.id));
  return byPerfil;
}

// ─── router ────────────────────────────────────────────────────────────────

export const reportesRouter = router({

  // ══════════════════════════════════════════════════════════════════════════
  // REPORTE 1: Residentes con historial de 12 meses
  // ══════════════════════════════════════════════════════════════════════════
  reporteResidentes: roleProcedure('tesorera')
    .input(z.object({
      estadoAgua: z.enum(['activo', 'pendiente_corte', 'cortado', 'pendiente_reconexion']).optional(),
      edificio:   z.string().optional(),
      busqueda:   z.string().optional(),
      orden:      z.enum(['edificio', 'nombre', 'estado']).default('edificio'),
    }))
    .query(async ({ ctx, input }) => {
      const circuito = await getCircuitoDelTesorera(ctx.user.id);

      const residentes = await db.query.perfilesResidente.findMany({
        where: (p, { eq, and }) => {
          const conds = [eq(p.circuitoId, circuito.id)];
          if (input.estadoAgua) conds.push(eq(p.estadoAgua, input.estadoAgua));
          if (input.edificio)   conds.push(eq(p.edificio, input.edificio));
          return and(...conds as [ReturnType<typeof eq>]);
        },
        with: { usuario: true },
      });

      const periodos = ultimos12Meses();

      // Busqueda de texto
      const filtrados = input.busqueda
        ? residentes.filter((r) => {
            const term = input.busqueda!.toLowerCase();
            return (
              (r.usuario?.name ?? '').toLowerCase().includes(term) ||
              r.departamento.toLowerCase().includes(term)
            );
          })
        : residentes;

      if (filtrados.length === 0) return [];

      const perfilIds = filtrados.map((r) => r.id);

      // Traer todos los pagos de estos residentes de una sola vez
      const pagosList = await db.query.pagos.findMany({
        where: (p, { inArray }) => inArray(p.perfilId, perfilIds),
        columns: {
          id: true,
          perfilId: true,
          mes: true,
          anio: true,
          monto: true,
          montoNetoRepresentante: true,
          estado: true,
          fechaPago: true,
        },
      });

      const resultado = filtrados.map((r) => {
        const pagosResidente = pagosList.filter((p) => p.perfilId === r.id);

        const pagosAnio = periodos.map(({ mes, anio }) => {
          const pago = pagosResidente.find(
            (p) => p.mes === mes && p.anio === anio && p.estado === 'pagado',
          );
          return {
            mes,
            anio,
            monto:     pago ? Number(pago.monto) : null,
            estado:    pago ? ('pagado' as const) : ('pendiente' as const),
            fechaPago: pago?.fechaPago ?? null,
          };
        });

        const totalPagado   = pagosAnio.reduce((s, p) => s + (p.monto ?? 0), 0);
        const mesesSinPagar = pagosAnio.filter((p) => p.estado === 'pendiente').length;
        const ultimoPago    = pagosResidente
          .filter((p) => p.estado === 'pagado' && p.fechaPago)
          .sort((a, b) => new Date(b.fechaPago!).getTime() - new Date(a.fechaPago!).getTime())[0]
          ?.fechaPago ?? null;

        return {
          id:           r.id,
          nombre:       r.usuario?.name ?? '',
          telefono:     r.telefono,
          edificio:     r.edificio,
          departamento: r.departamento,
          estadoAgua:   r.estadoAgua,
          pagosAnio,
          totalPagado,
          mesesSinPagar,
          ultimoPago,
        };
      });

      // Ordenamiento
      if (input.orden === 'nombre') {
        resultado.sort((a, b) => a.nombre.localeCompare(b.nombre));
      } else if (input.orden === 'estado') {
        const prioridad: Record<string, number> = { activo: 0, pendiente_corte: 1, pendiente_reconexion: 2, cortado: 3 };
        resultado.sort((a, b) => (prioridad[a.estadoAgua] ?? 4) - (prioridad[b.estadoAgua] ?? 4));
      } else {
        // 'edificio': numérico + letra de piso dentro del edificio
        return sortPorEdificio(resultado);
      }

      return resultado;
    }),

  // Lista de edificios únicos del circuito (para el filtro)
  edificiosCircuito: roleProcedure('tesorera').query(async ({ ctx }) => {
    const circuito = await getCircuitoDelTesorera(ctx.user.id);
    const perfiles = await db.query.perfilesResidente.findMany({
      where: (p, { eq }) => eq(p.circuitoId, circuito.id),
      columns: { edificio: true },
    });
    return [...new Set(perfiles.map((p) => p.edificio))].sort();
  }),

  // ══════════════════════════════════════════════════════════════════════════
  // REPORTE 2: Financiero del mes
  // ══════════════════════════════════════════════════════════════════════════
  reporteFinanciero: roleProcedure('tesorera')
    .input(z.object({
      mes:  z.number().int().min(1).max(12),
      anio: z.number().int().min(2020).max(2099),
    }))
    .query(async ({ ctx, input }) => {
      const circuito = await getCircuitoDelTesorera(ctx.user.id);

      const [residentes, pagosPeriodo, gastosPeriodo, ingresosPeriodo] = await Promise.all([
        db.query.perfilesResidente.findMany({
          where: (p, { eq }) => eq(p.circuitoId, circuito.id),
        }),
        db.query.pagos.findMany({
          where: (p, { eq, and }) =>
            and(
              eq(p.circuitoId, circuito.id),
              eq(p.mes, input.mes),
              eq(p.anio, input.anio),
              eq(p.estado, 'pagado'),
            ),
          with: { perfil: true },
        }),
        db.query.gastosCircuito.findMany({
          where: (g, { eq, and }) =>
            and(
              eq(g.circuitoId, circuito.id),
              eq(g.mes, input.mes),
              eq(g.anio, input.anio),
            ),
          orderBy: (g, { asc }) => [asc(g.fecha)],
        }),
        db.query.ingresosAdicionales.findMany({
          where: (i, { eq, and }) =>
            and(
              eq(i.circuitoId, circuito.id),
              eq(i.mes, input.mes),
              eq(i.anio, input.anio),
            ),
          orderBy: (i, { asc }) => [asc(i.fecha)],
        }),
      ]);

      const totalPagos             = pagosPeriodo.reduce((s, p) => s + Number(p.monto), 0);
      const totalIngresosAdicionales = ingresosPeriodo.reduce((s, i) => s + Number(i.monto), 0);
      const totalRecaudado         = totalPagos + totalIngresosAdicionales;
      const totalGastos            = gastosPeriodo.reduce((s, g) => s + Number(g.monto), 0);
      const montoMensual   = Number(circuito.montoMensual);
      const totalEsperado  = residentes.length * montoMensual;
      const porcentajeCobranza = totalEsperado > 0
        ? Math.round((totalRecaudado / totalEsperado) * 100 * 10) / 10
        : 0;

      // Agrupar por edificio
      const edificios = [...new Set(residentes.map((r) => r.edificio))].sort();
      const porEdificio = edificios.map((ed) => {
        const resEdificio  = residentes.filter((r) => r.edificio === ed);
        const pagosEdificio = pagosPeriodo.filter((p) => p.perfil?.edificio === ed);
        const pagoIds = new Set(pagosEdificio.map((p) => p.perfilId));
        return {
          edificio:          ed,
          totalPagado:       pagosEdificio.reduce((s, p) => s + Number(p.monto), 0),
          cantidadPagos:     pagosEdificio.length,
          residentesActivos: resEdificio.filter((r) => pagoIds.has(r.id)).length,
          residentesMorosos: resEdificio.filter((r) => !pagoIds.has(r.id)).length,
        };
      });

      return {
        circuito:                { id: circuito.id, nombre: circuito.nombre, montoMensual },
        mes:                     input.mes,
        anio:                    input.anio,
        totalRecaudado,
        totalPagos,
        totalIngresosAdicionales,
        totalResidentes:         residentes.length,
        totalPagaron:            pagosPeriodo.length,
        totalMorosos:            residentes.length - pagosPeriodo.length,
        porcentajeCobranza,
        totalGastos,
        saldo:                   totalRecaudado - totalGastos,
        porEdificio,
        gastos:                  gastosPeriodo,
        ingresos:                ingresosPeriodo,
      };
    }),

  // ══════════════════════════════════════════════════════════════════════════
  // CRUD GASTOS
  // ══════════════════════════════════════════════════════════════════════════
  agregarGasto: roleProcedure('tesorera')
    .input(z.object({
      concepto:  z.string().min(1, 'Concepto requerido'),
      monto:     z.number().positive('El monto debe ser positivo'),
      categoria: z.enum(['mantenimiento', 'administracion', 'servicios', 'otros']),
      fecha:     z.string().datetime({ offset: true }).or(z.string().date()),
      mes:       z.number().int().min(1).max(12),
      anio:      z.number().int().min(2020).max(2099),
    }))
    .mutation(async ({ ctx, input }) => {
      const circuito = await getCircuitoDelTesorera(ctx.user.id);

      const [gasto] = await db.insert(gastosCircuito).values({
        circuitoId:      circuito.id,
        representanteId: ctx.user.id,
        concepto:        input.concepto,
        monto:           String(input.monto),
        categoria:       input.categoria,
        fecha:           new Date(input.fecha),
        mes:             input.mes,
        anio:            input.anio,
      }).returning();

      return gasto;
    }),

  editarGasto: roleProcedure('tesorera')
    .input(z.object({
      id:        z.string().uuid(),
      concepto:  z.string().min(1).optional(),
      monto:     z.number().positive().optional(),
      categoria: z.enum(['mantenimiento', 'administracion', 'servicios', 'otros']).optional(),
      fecha:     z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const circuito = await getCircuitoDelTesorera(ctx.user.id);

      const gasto = await db.query.gastosCircuito.findFirst({
        where: (g, { eq }) => eq(g.id, input.id),
      });
      if (!gasto)                          throw new TRPCError({ code: 'NOT_FOUND' });
      if (gasto.circuitoId !== circuito.id) throw new TRPCError({ code: 'FORBIDDEN' });

      const updates: Partial<typeof gastosCircuito.$inferInsert> = {};
      if (input.concepto)  updates.concepto  = input.concepto;
      if (input.monto)     updates.monto     = String(input.monto);
      if (input.categoria) updates.categoria = input.categoria;
      if (input.fecha)     updates.fecha     = new Date(input.fecha);

      await db.update(gastosCircuito).set(updates).where(eq(gastosCircuito.id, input.id));
      return { ok: true };
    }),

  eliminarGasto: roleProcedure('tesorera')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const circuito = await getCircuitoDelTesorera(ctx.user.id);

      const gasto = await db.query.gastosCircuito.findFirst({
        where: (g, { eq }) => eq(g.id, input.id),
      });
      if (!gasto)                          throw new TRPCError({ code: 'NOT_FOUND' });
      if (gasto.circuitoId !== circuito.id) throw new TRPCError({ code: 'FORBIDDEN' });

      await db.delete(gastosCircuito).where(eq(gastosCircuito.id, input.id));
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════════════════
  // CRUD INGRESOS ADICIONALES
  // ══════════════════════════════════════════════════════════════════════════
  agregarIngreso: roleProcedure('tesorera')
    .input(z.object({
      concepto: z.string().min(1, 'Concepto requerido'),
      monto:    z.number().positive('El monto debe ser positivo'),
      fecha:    z.string().datetime({ offset: true }).or(z.string().date()),
      mes:      z.number().int().min(1).max(12),
      anio:     z.number().int().min(2020).max(2099),
    }))
    .mutation(async ({ ctx, input }) => {
      const circuito = await getCircuitoDelTesorera(ctx.user.id);
      const [ingreso] = await db.insert(ingresosAdicionales).values({
        circuitoId:      circuito.id,
        representanteId: ctx.user.id,
        concepto:        input.concepto,
        monto:           String(input.monto),
        fecha:           new Date(input.fecha),
        mes:             input.mes,
        anio:            input.anio,
      }).returning();
      return ingreso;
    }),

  editarIngreso: roleProcedure('tesorera')
    .input(z.object({
      id:       z.string().uuid(),
      concepto: z.string().min(1).optional(),
      monto:    z.number().positive().optional(),
      fecha:    z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const circuito = await getCircuitoDelTesorera(ctx.user.id);
      const ingreso = await db.query.ingresosAdicionales.findFirst({
        where: (i, { eq }) => eq(i.id, input.id),
      });
      if (!ingreso)                            throw new TRPCError({ code: 'NOT_FOUND' });
      if (ingreso.circuitoId !== circuito.id)  throw new TRPCError({ code: 'FORBIDDEN' });

      const updates: Partial<typeof ingresosAdicionales.$inferInsert> = {};
      if (input.concepto) updates.concepto = input.concepto;
      if (input.monto)    updates.monto    = String(input.monto);
      if (input.fecha)    updates.fecha    = new Date(input.fecha);

      await db.update(ingresosAdicionales).set(updates).where(eq(ingresosAdicionales.id, input.id));
      return { ok: true };
    }),

  eliminarIngreso: roleProcedure('tesorera')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const circuito = await getCircuitoDelTesorera(ctx.user.id);
      const ingreso = await db.query.ingresosAdicionales.findFirst({
        where: (i, { eq }) => eq(i.id, input.id),
      });
      if (!ingreso)                            throw new TRPCError({ code: 'NOT_FOUND' });
      if (ingreso.circuitoId !== circuito.id)  throw new TRPCError({ code: 'FORBIDDEN' });

      await db.delete(ingresosAdicionales).where(eq(ingresosAdicionales.id, input.id));
      return { ok: true };
    }),
});
