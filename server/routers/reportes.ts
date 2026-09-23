import { router, roleProcedure, operationalRoleProcedure } from '../trpc';
import { z } from 'zod';
// eslint-disable-next-line no-restricted-imports -- complex financial aggregations not yet in a repo
import { and, desc, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

// eslint-disable-next-line no-restricted-imports -- complex financial aggregations not yet in a repo
import { db } from '@/db';
// eslint-disable-next-line no-restricted-imports -- complex financial aggregations not yet in a repo
import { cortes, gastosCircuito, ingresosAdicionales, ordenesTrabajo } from '@/db/schema';

// ─── helpers ───────────────────────────────────────────────────────────────

// Edif. 8 < Edif. 10; dentro del edificio: 314a, 315a, 314b, 315b, 314c, 315c
function parsearDepto(depto: string): { letra: string; numero: number } {
  const m = depto.match(/^(\d+)([a-zA-Z]?)$/);
  if (m) return { numero: parseInt(m[1], 10), letra: m[2].toLowerCase() };
  return { numero: 0, letra: depto.toLowerCase() };
}

function sortPorEdificio<T extends { edificio: string; departamento: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const ea = parseInt(a.edificio, 10), eb = parseInt(b.edificio, 10);
    const edifCmp = isNaN(ea) || isNaN(eb) ? a.edificio.localeCompare(b.edificio) : ea - eb;
    if (edifCmp !== 0) return edifCmp;
    const da = parsearDepto(a.departamento), db = parsearDepto(b.departamento);
    if (da.letra !== db.letra) return da.letra.localeCompare(db.letra);
    return da.numero - db.numero;
  });
}

function montoDisponibleCircuito(pago: {
  monto: string;
  montoBase?: string | null;
  montoNetoRepresentante?: string | null;
}) {
  // En tarjeta, `monto` puede incluir comisión/cobro bruto. El reporte del circuito
  // debe cuadrar contra lo disponible para administración, no contra lo cobrado por MP.
  return Number(pago.montoNetoRepresentante ?? pago.montoBase ?? pago.monto);
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

async function getCircuitoDelTesorera(userId: string, tenantId: string) {
  // Ruta principal: circuito con tesoreraId asignado
  const byId = await db.query.circuitos.findFirst({
    where: (c, { eq, and }) => and(eq(c.tesoreraId, userId), eq(c.fraccionamientoId, tenantId)),
  });
  if (byId) return byId;

  // Fallback solo de lectura para datos previos al fix de tesoreraId. No se
  // reasigna el circuito desde una query: esa correccion debe hacerla admin.
  const perfil = await db.query.perfilesResidente.findFirst({
    where: (p, { eq, and }) => and(eq(p.userId, userId), eq(p.fraccionamientoId, tenantId)),
  });
  if (!perfil?.circuitoId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes un circuito asignado.' });
  }
  const byPerfil = await db.query.circuitos.findFirst({
    where: (c, { eq, and }) => and(eq(c.id, perfil.circuitoId!), eq(c.fraccionamientoId, tenantId)),
  });
  if (!byPerfil) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes un circuito asignado.' });
  }
  if (byPerfil.tesoreraId && byPerfil.tesoreraId !== userId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Este circuito ya tiene otra tesorera asignada.' });
  }
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
      const circuito = await getCircuitoDelTesorera(ctx.user.id, ctx.user.fraccionamientoId!);

      const residentes = await db.query.perfilesResidente.findMany({
        where: (p, { eq, and }) => {
          const conds = [eq(p.circuitoId, circuito.id), eq(p.fraccionamientoId, ctx.user.fraccionamientoId!)];
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
        where: (p, { inArray, and, eq }) => and(
          inArray(p.perfilId, perfilIds),
          eq(p.fraccionamientoId, ctx.user.fraccionamientoId!),
        ),
        columns: {
          id: true,
          perfilId: true,
          mes: true,
          anio: true,
          monto: true,
          montoBase: true,
          montoNetoRepresentante: true,
          estado: true,
          fechaPago: true,
        },
      });

      // El estado financiero y el operativo son fuentes distintas. Este
      // resumen permite a tesorería ver si hay un trabajo físico pendiente sin
      // inferirlo únicamente a partir del pago.
      const [ordenesList, cortesActivos] = await Promise.all([
        db.query.ordenesTrabajo.findMany({
          where: (o, { and, eq, inArray }) => and(
            inArray(o.perfilId, perfilIds),
            eq(o.fraccionamientoId, ctx.user.fraccionamientoId!),
          ),
          columns: {
            id: true,
            perfilId: true,
            tipo: true,
            estado: true,
            creadoEn: true,
            completadoEn: true,
          },
          orderBy: (o, { desc }) => [desc(o.creadoEn)],
        }),
        db.query.cortes.findMany({
          where: (c, { and, eq, inArray }) => and(
            inArray(c.perfilId, perfilIds),
            eq(c.activo, true),
          ),
          columns: { id: true, perfilId: true },
        }),
      ]);

      const resultado = filtrados.map((r) => {
        const pagosResidente = pagosList.filter((p) => p.perfilId === r.id);

        const pagosAnio = periodos.map(({ mes, anio }) => {
          const pago = pagosResidente.find(
            (p) => p.mes === mes && p.anio === anio && p.estado === 'pagado',
          );
          return {
            mes,
            anio,
            monto:     pago ? montoDisponibleCircuito(pago) : null,
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

        const ordenesResidente = ordenesList.filter((orden) => orden.perfilId === r.id);
        const ultimaOrden = (tipo: 'corte' | 'reconexion') => {
          const orden = ordenesResidente.find((item) => item.tipo === tipo);
          return orden
            ? {
                id: orden.id,
                estado: orden.estado,
                creadoEn: orden.creadoEn,
                completadoEn: orden.completadoEn,
              }
            : null;
        };

        return {
          id:           r.id,
          nombre:       r.usuario?.name ?? '',
          telefono:     r.telefono,
          edificio:     r.edificio,
          departamento: r.departamento,
          estadoAgua:   r.estadoAgua,
          corteFisicoActivo: cortesActivos.some((corte) => corte.perfilId === r.id),
          ordenTrabajo: {
            corte: ultimaOrden('corte'),
            reconexion: ultimaOrden('reconexion'),
          },
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
    const circuito = await getCircuitoDelTesorera(ctx.user.id, ctx.user.fraccionamientoId!);
    const perfiles = await db.query.perfilesResidente.findMany({
      where: (p, { eq, and }) => and(eq(p.circuitoId, circuito.id), eq(p.fraccionamientoId, ctx.user.fraccionamientoId!)),
      columns: { edificio: true },
    });
    return [...new Set(perfiles.map((p) => p.edificio))].sort();
  }),

  // Reporte operativo independiente de cobranza. Solo devuelve residentes y
  // órdenes del tenant/circuito autorizado.
  reporteOrdenesTrabajo: roleProcedure('admin', 'representante', 'cuadrilla_cortes')
    .input(z.object({
      fraccionamientoId: z.string().uuid().optional(),
      circuitoId: z.string().uuid().optional(),
      tipo: z.enum(['corte', 'reconexion']).optional(),
      estado: z.enum(['pendiente', 'asignada', 'en_progreso', 'completada', 'cancelada']).optional(),
      desde: z.string().datetime({ offset: true }).optional(),
      hasta: z.string().datetime({ offset: true }).optional(),
    }).default({}))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user.role === 'admin' ? input.fraccionamientoId : ctx.user.fraccionamientoId;
      if (ctx.user.role !== 'admin' && !tenantId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cuenta sin fraccionamiento' });
      }

      let circuitoId = input.circuitoId;
      if (ctx.user.role === 'representante') {
        const circuito = await db.query.circuitos.findFirst({
          where: (c, { and, eq }) => and(eq(c.representanteId, ctx.user.id), eq(c.fraccionamientoId, tenantId!)),
        });
        if (!circuito) throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes un circuito asignado' });
        if (circuitoId && circuitoId !== circuito.id) throw new TRPCError({ code: 'FORBIDDEN' });
        circuitoId = circuito.id;
      } else if (ctx.user.role === 'cuadrilla_cortes') {
        const perfil = await db.query.perfilesResidente.findFirst({
          where: (p, { and, eq }) => and(eq(p.userId, ctx.user.id), eq(p.fraccionamientoId, tenantId!)),
        });
        if (!perfil) throw new TRPCError({ code: 'FORBIDDEN', message: 'Cuadrilla sin circuito asignado' });
        if (circuitoId && circuitoId !== perfil.circuitoId) throw new TRPCError({ code: 'FORBIDDEN' });
        circuitoId = perfil.circuitoId;
      }

      const rows = await db.query.ordenesTrabajo.findMany({
        where: (o, { and, eq, gte, lte }) => and(
          tenantId ? eq(o.fraccionamientoId, tenantId) : undefined,
          circuitoId ? eq(o.circuitoId, circuitoId) : undefined,
          input.tipo ? eq(o.tipo, input.tipo) : undefined,
          input.estado ? eq(o.estado, input.estado) : undefined,
          input.desde ? gte(o.creadoEn, new Date(input.desde)) : undefined,
          input.hasta ? lte(o.creadoEn, new Date(input.hasta)) : undefined,
        ),
        with: { perfil: { with: { usuario: true } }, circuito: true, trabajador: true },
        orderBy: (o, { desc }) => [desc(o.creadoEn)],
      });

      return rows.map((row) => ({
        id: row.id,
        tipo: row.tipo,
        estado: row.estado,
        motivo: row.motivo,
        creadoEn: row.creadoEn,
        asignadoEn: row.asignadoEn,
        iniciadoEn: row.iniciadoEn,
        completadoEn: row.completadoEn,
        canceladoEn: row.canceladoEn,
        residente: {
          id: row.perfil.id,
          nombre: row.perfil.usuario?.name ?? '',
          edificio: row.perfil.edificio,
          departamento: row.perfil.departamento,
          estadoAgua: row.perfil.estadoAgua,
        },
        circuito: { id: row.circuito.id, nombre: row.circuito.nombre },
        trabajador: row.trabajador ? { id: row.trabajador.id, nombre: row.trabajador.name } : null,
      }));
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
      const circuito = await getCircuitoDelTesorera(ctx.user.id, ctx.user.fraccionamientoId!);

      const [residentes, pagosPeriodo, gastosPeriodo, ingresosPeriodo, ordenesPeriodo] = await Promise.all([
        db.query.perfilesResidente.findMany({
          where: (p, { eq, and }) => and(eq(p.circuitoId, circuito.id), eq(p.fraccionamientoId, ctx.user.fraccionamientoId!)),
        }),
        db.query.pagos.findMany({
          where: (p, { eq, and }) =>
            and(
              eq(p.circuitoId, circuito.id),
              eq(p.fraccionamientoId, ctx.user.fraccionamientoId!),
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
              eq(g.fraccionamientoId, ctx.user.fraccionamientoId!),
              eq(g.mes, input.mes),
              eq(g.anio, input.anio),
            ),
          orderBy: (g, { desc }) => [desc(g.fecha)],
        }),
        db.query.ingresosAdicionales.findMany({
          where: (i, { eq, and }) =>
            and(
              eq(i.circuitoId, circuito.id),
              eq(i.fraccionamientoId, ctx.user.fraccionamientoId!),
              eq(i.mes, input.mes),
              eq(i.anio, input.anio),
            ),
          orderBy: (i, { desc }) => [desc(i.fecha)],
        }),
        db.query.ordenesTrabajo.findMany({
          where: (o, { eq, and }) => and(
            eq(o.circuitoId, circuito.id),
            eq(o.fraccionamientoId, ctx.user.fraccionamientoId!),
          ),
          columns: { tipo: true, estado: true },
        }),
      ]);

      const totalPagos             = pagosPeriodo.reduce((s, p) => s + montoDisponibleCircuito(p), 0);
      const totalIngresosAdicionales = ingresosPeriodo.reduce((s, i) => s + Number(i.monto), 0);
      const totalRecaudado         = totalPagos + totalIngresosAdicionales;
      const totalGastos            = gastosPeriodo.reduce((s, g) => s + Number(g.monto), 0);
      const montoMensual   = Number(circuito.montoMensual);
      const perfilesPagados = new Set(pagosPeriodo.map((p) => p.perfilId));
      const totalPagaron = perfilesPagados.size;
      const porcentajeCobranza = residentes.length > 0
        ? Math.round((totalPagaron / residentes.length) * 100 * 10) / 10
        : 0;
      const ordenesTrabajo = {
        total: ordenesPeriodo.length,
        cortesPendientes: ordenesPeriodo.filter((o) => o.tipo === 'corte' && ['pendiente', 'asignada', 'en_progreso'].includes(o.estado)).length,
        reconexionesPendientes: ordenesPeriodo.filter((o) => o.tipo === 'reconexion' && ['pendiente', 'asignada', 'en_progreso'].includes(o.estado)).length,
        completadas: ordenesPeriodo.filter((o) => o.estado === 'completada').length,
        canceladas: ordenesPeriodo.filter((o) => o.estado === 'cancelada').length,
      };

      // Agrupar por edificio
      const edificios = [...new Set(residentes.map((r) => r.edificio))].sort();
      const porEdificio = edificios.map((ed) => {
        const resEdificio  = residentes.filter((r) => r.edificio === ed);
        const pagosEdificio = pagosPeriodo.filter((p) => p.perfil?.edificio === ed);
        const pagoIds = new Set(pagosEdificio.map((p) => p.perfilId));
        return {
          edificio:          ed,
          totalPagado:       pagosEdificio.reduce((s, p) => s + montoDisponibleCircuito(p), 0),
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
        totalPagaron,
        totalMorosos:            residentes.length - totalPagaron,
        porcentajeCobranza,
        totalGastos,
        saldo:                   totalRecaudado - totalGastos,
        ordenesTrabajo,
        porEdificio,
        gastos:                  gastosPeriodo,
        ingresos:                ingresosPeriodo,
      };
    }),

  // ══════════════════════════════════════════════════════════════════════════
  // CRUD GASTOS
  // ══════════════════════════════════════════════════════════════════════════
  agregarGasto: operationalRoleProcedure('tesorera')
    .input(z.object({
      concepto:  z.string().min(1, 'Concepto requerido'),
      monto:     z.number().positive('El monto debe ser positivo'),
      categoria: z.enum(['mantenimiento', 'administracion', 'servicios', 'otros']),
      fecha:     z.string().datetime({ offset: true }).or(z.string().date()),
      mes:       z.number().int().min(1).max(12),
      anio:      z.number().int().min(2020).max(2099),
    }))
    .mutation(async ({ ctx, input }) => {
      const circuito = await getCircuitoDelTesorera(ctx.user.id, ctx.user.fraccionamientoId!);

      const [gasto] = await db.insert(gastosCircuito).values({
        fraccionamientoId: circuito.fraccionamientoId!,
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

  editarGasto: operationalRoleProcedure('tesorera')
    .input(z.object({
      id:        z.string().uuid(),
      concepto:  z.string().min(1).optional(),
      monto:     z.number().positive().optional(),
      categoria: z.enum(['mantenimiento', 'administracion', 'servicios', 'otros']).optional(),
      fecha:     z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const circuito = await getCircuitoDelTesorera(ctx.user.id, ctx.user.fraccionamientoId!);

      const gasto = await db.query.gastosCircuito.findFirst({
        where: (g, { eq, and }) => and(eq(g.id, input.id), eq(g.fraccionamientoId, ctx.user.fraccionamientoId!)),
      });
      if (!gasto)                          throw new TRPCError({ code: 'NOT_FOUND' });
      if (gasto.circuitoId !== circuito.id) throw new TRPCError({ code: 'FORBIDDEN' });

      const updates: Partial<typeof gastosCircuito.$inferInsert> = {};
      if (input.concepto)  updates.concepto  = input.concepto;
      if (input.monto)     updates.monto     = String(input.monto);
      if (input.categoria) updates.categoria = input.categoria;
      if (input.fecha)     updates.fecha     = new Date(input.fecha);

      await db.update(gastosCircuito).set(updates).where(and(
        eq(gastosCircuito.id, input.id),
        eq(gastosCircuito.fraccionamientoId, ctx.user.fraccionamientoId!),
      ));
      return { ok: true };
    }),

  eliminarGasto: operationalRoleProcedure('tesorera')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const circuito = await getCircuitoDelTesorera(ctx.user.id, ctx.user.fraccionamientoId!);

      const gasto = await db.query.gastosCircuito.findFirst({
        where: (g, { eq, and }) => and(eq(g.id, input.id), eq(g.fraccionamientoId, ctx.user.fraccionamientoId!)),
      });
      if (!gasto)                          throw new TRPCError({ code: 'NOT_FOUND' });
      if (gasto.circuitoId !== circuito.id) throw new TRPCError({ code: 'FORBIDDEN' });

      await db.delete(gastosCircuito).where(and(
        eq(gastosCircuito.id, input.id),
        eq(gastosCircuito.fraccionamientoId, ctx.user.fraccionamientoId!),
      ));
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════════════════
  // CRUD INGRESOS ADICIONALES
  // ══════════════════════════════════════════════════════════════════════════
  agregarIngreso: operationalRoleProcedure('tesorera')
    .input(z.object({
      concepto: z.string().min(1, 'Concepto requerido'),
      monto:    z.number().positive('El monto debe ser positivo'),
      fecha:    z.string().datetime({ offset: true }).or(z.string().date()),
      mes:      z.number().int().min(1).max(12),
      anio:     z.number().int().min(2020).max(2099),
    }))
    .mutation(async ({ ctx, input }) => {
      const circuito = await getCircuitoDelTesorera(ctx.user.id, ctx.user.fraccionamientoId!);
      const [ingreso] = await db.insert(ingresosAdicionales).values({
        fraccionamientoId: circuito.fraccionamientoId!,
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

  editarIngreso: operationalRoleProcedure('tesorera')
    .input(z.object({
      id:       z.string().uuid(),
      concepto: z.string().min(1).optional(),
      monto:    z.number().positive().optional(),
      fecha:    z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const circuito = await getCircuitoDelTesorera(ctx.user.id, ctx.user.fraccionamientoId!);
      const ingreso = await db.query.ingresosAdicionales.findFirst({
        where: (i, { eq, and }) => and(eq(i.id, input.id), eq(i.fraccionamientoId, ctx.user.fraccionamientoId!)),
      });
      if (!ingreso)                            throw new TRPCError({ code: 'NOT_FOUND' });
      if (ingreso.circuitoId !== circuito.id)  throw new TRPCError({ code: 'FORBIDDEN' });

      const updates: Partial<typeof ingresosAdicionales.$inferInsert> = {};
      if (input.concepto) updates.concepto = input.concepto;
      if (input.monto)    updates.monto    = String(input.monto);
      if (input.fecha)    updates.fecha    = new Date(input.fecha);

      await db.update(ingresosAdicionales).set(updates).where(and(
        eq(ingresosAdicionales.id, input.id),
        eq(ingresosAdicionales.fraccionamientoId, ctx.user.fraccionamientoId!),
      ));
      return { ok: true };
    }),

  eliminarIngreso: operationalRoleProcedure('tesorera')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const circuito = await getCircuitoDelTesorera(ctx.user.id, ctx.user.fraccionamientoId!);
      const ingreso = await db.query.ingresosAdicionales.findFirst({
        where: (i, { eq, and }) => and(eq(i.id, input.id), eq(i.fraccionamientoId, ctx.user.fraccionamientoId!)),
      });
      if (!ingreso)                            throw new TRPCError({ code: 'NOT_FOUND' });
      if (ingreso.circuitoId !== circuito.id)  throw new TRPCError({ code: 'FORBIDDEN' });

      await db.delete(ingresosAdicionales).where(and(
        eq(ingresosAdicionales.id, input.id),
        eq(ingresosAdicionales.fraccionamientoId, ctx.user.fraccionamientoId!),
      ));
      return { ok: true };
    }),
});
