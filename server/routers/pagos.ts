// server/routers/pagos.ts

import { router, protectedProcedure, roleProcedure } from '../trpc';
import { z } from 'zod';
import { db } from '@/db';
import { pagos, perfilesResidente, cortes, tickets } from '@/db/schema';
import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { obtenerPeriodoVigente, esMoroso, verificarCircuitoActivo } from '../utils'; // ✅ IMPORTADO
import { calcularDesglosePago, calcularMontoBase } from '../payment-calculator';

export const pagosRouter = router({
  // ============================================
  // miHistorial: Historial del residente autenticado
  // ============================================
  miHistorial: protectedProcedure.query(async ({ ctx }) => {
    console.log('=== miHistorial iniciado ===');
    console.log('USER ID:', ctx.user.id);

    // circuito activity verification removed: function not exported from ../utils

    const perfil = await db.query.perfilesResidente.findFirst({
      where: (p, { eq }) => eq(p.userId, ctx.user.id),
      with: { circuito: true }, // ✅ Trae el circuito completo
    });
    console.log('PERFIL ENCONTRADO:', perfil ? perfil.id : 'NO ENCONTRADO');

    if (!perfil) {
      return { 
        perfil: null, 
        circuito: null,
        pagos: [], 
        corteActivo: false, 
        esMoroso: false,
        mes: null,
        anio: null,
      };
    }

    const historial = await db.query.pagos.findMany({
      where: (p, { eq }) => eq(p.perfilId, perfil.id),
      orderBy: (p, { desc }) => [desc(p.anio), desc(p.mes)],
      limit: 12,
    });
    console.log(`HISTORIAL: ${historial.length} pagos encontrados`);

    const corteActivo = await db.query.cortes.findFirst({
      where: (c, { eq, and }) => and(eq(c.perfilId, perfil.id), eq(c.activo, true)),
    });
    console.log('CORTE ACTIVO:', corteActivo ? 'SI' : 'NO');

    const { mes, anio } = obtenerPeriodoVigente();
    const historialParaMoroso = historial.map((p) => ({
      mes: p.mes,
      anio: p.anio,
      estado: p.estado ?? '',
    }));
    const moroso = esMoroso(historialParaMoroso, mes, anio);
    console.log(`MOROSO: ${moroso}, PERIODO: ${mes}/${anio}`);

    return {
      perfil,
      circuito: perfil.circuito, // ✅ Devuelve el circuito completo con sus montos
      pagos: historial,
      corteActivo: !!corteActivo,
      esMoroso: moroso,
      mes,
      anio,
    };
  }),

  // ============================================
  // pagar: Registrar pago mensual o reconexión
  // ============================================
  pagar: protectedProcedure
    .input(z.object({ metodo: z.enum(['transferencia', 'efectivo']) }))
    .mutation(async ({ ctx, input }) => {
      console.log('=== PAGAR iniciado ===');
      console.log('USER ID:', ctx.user.id);
      console.log('METODO:', input.metodo);

      await verificarCircuitoActivo(ctx.user.id); // ✅ AGREGADO

      const perfil = await db.query.perfilesResidente.findFirst({
        where: (p, { eq }) => eq(p.userId, ctx.user.id),
        with: { circuito: true },
      });
      console.log('PERFIL ENCONTRADO:', perfil ? perfil.id : 'NO ENCONTRADO');

      if (!perfil) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Completa tu perfil primero' });
      }

      if (!perfil.circuito) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Circuito no encontrado' });
      }

      const ahora = new Date();
      const mes = ahora.getMonth() + 1;
      const anio = ahora.getFullYear();
      console.log(`PERIODO: ${mes}/${anio}`);
      console.log(`ESTADO DEL AGUA ACTUAL: ${perfil.estadoAgua}`);

      // Verificar si ya pagó este mes
      console.log('VERIFICANDO SI YA PAGO ESTE MES...');
      const yaPago = await db.query.pagos.findFirst({
        where: (p, { eq, and }) =>
          and(eq(p.perfilId, perfil.id), eq(p.mes, mes), eq(p.anio, anio), eq(p.estado, 'pagado')),
      });
      if (yaPago) {
        console.log('YA HABIA PAGADO ESTE MES');
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ya pagaste este mes' });
      }
      console.log('VERIFICACION OK - NO HABIA PAGADO');

      // ✅ Monto según estado del agua
      const esReconexion = perfil.estadoAgua === 'cortado';
      const montoBase = calcularMontoBase(
        perfil.circuito.montoMensual,
        esReconexion,
        perfil.circuito.montoReconexion
      );
      const desglose = calcularDesglosePago(montoBase);
      const monto = desglose.total;
      console.log(`MONTO: ${monto}, ES_RECONEXION: ${esReconexion}`);

      const folio = `AGU-${nanoid(10).toUpperCase()}`;
      console.log('FOLIO GENERADO:', folio);

      // TRANSACCIÓN PRINCIPAL
      console.log('=== INICIANDO TRANSACCION ===');
      let result;
      try {
        result = await db.transaction(async (tx) => {
          console.log('DENTRO DE TRANSACCION - INSERTANDO PAGO...');
          const [pago] = await tx
            .insert(pagos)
            .values({
              perfilId: perfil.id,
              circuitoId: perfil.circuito.id,
              representanteId: perfil.circuito.representanteId,
              mes,
              anio,
              monto,
              montoBase: desglose.montoBase,
              iva: desglose.iva,
              comisionMercadoPago: desglose.comisionMercadoPago,
              retencionIsr: desglose.retencionIsr,
              retencionIva: desglose.retencionIva,
              montoNetoRepresentante: desglose.montoNetoRepresentante,
              mercadoPagoCollectorId: perfil.circuito.mercadoPagoCollectorId,
              estado: 'pagado',
              metodo: input.metodo,
              folio,
              esReconexion,
              fechaPago: new Date(),
            })
            .returning();
          console.log('PAGO INSERTADO, ID:', pago.id);

          // ✅ Si estaba cortado, pasa a 'pendiente_reconexion'
          if (esReconexion) {
            console.log('ACTUALIZANDO ESTADO A pendiente_reconexion...');
            await tx
              .update(perfilesResidente)
              .set({ estadoAgua: 'pendiente_reconexion' })
              .where(eq(perfilesResidente.id, perfil.id));
            console.log('ESTADO ACTUALIZADO A pendiente_reconexion');

            // Buscar y desactivar el corte activo
            const corteActivo = await tx.query.cortes.findFirst({
              where: (c, { eq, and }) => and(eq(c.perfilId, perfil.id), eq(c.activo, true)),
            });
            if (corteActivo) {
              console.log('DESACTIVANDO CORTE ACTIVO...');
              await tx
                .update(cortes)
                .set({ activo: false, fechaReconexion: new Date() })
                .where(eq(cortes.id, corteActivo.id));
              console.log('CORTE DESACTIVADO');
            }
          }

          return pago;
        });
        console.log('=== TRANSACCION COMPLETADA EXITOSAMENTE ===');
      } catch (txError: any) {
        console.error('❌ ERROR EN TRANSACCION:', txError.message);
        console.error('ERROR COMPLETO:', txError);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Error en transacción: ${txError.message}`,
        });
      }

      // INSERTAR TICKET
      console.log('INSERTANDO TICKET...');
      try {
        await db.insert(tickets).values({
          pagoId: result.id,
          folio,
          pdfUrl: null,
        });
        console.log('✅ TICKET INSERTADO, FOLIO:', folio);
      } catch (ticketError: any) {
        console.error('❌ ERROR INSERTANDO TICKET:', ticketError.message);
        console.error('ERROR COMPLETO:', ticketError);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Error insertando ticket: ${ticketError.message}`,
        });
      }

      console.log('=== 🎉 PAGO COMPLETADO EXITOSAMENTE ===');
      return { folio, monto, esReconexion };
    }),

  // ============================================
  // historialDe: Historial de un perfil específico
  // ============================================
  historialDe: roleProcedure('admin', 'representante')
    .input(z.object({ perfilId: z.string().uuid() }))
    .query(async ({ input }) => {
      console.log('=== historialDe iniciado ===');
      console.log('PERFIL ID:', input.perfilId);

      const result = await db.query.pagos.findMany({
        where: (p, { eq }) => eq(p.perfilId, input.perfilId),
        orderBy: (p, { desc }) => [desc(p.anio), desc(p.mes)],
      });
      console.log(`HISTORIAL: ${result.length} pagos encontrados`);

      return result;
    }),

  registrarManual: roleProcedure('representante')
    .input(z.object({
      perfilId: z.string().uuid(),
      metodo: z.enum(['efectivo', 'transferencia']),
    }))
    .mutation(async ({ ctx, input }) => {
      const { mes, anio } = obtenerPeriodoVigente();

      const miCircuito = await db.query.circuitos.findFirst({
        where: (c, { eq }) => eq(c.representanteId, ctx.user.id),
      });
      if (!miCircuito) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes circuito asignado' });
      }
      if (!miCircuito.activo) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Tu circuito esta inhabilitado' });
      }

      const perfil = await db.query.perfilesResidente.findFirst({
        where: (p, { eq, and }) =>
          and(eq(p.id, input.perfilId), eq(p.circuitoId, miCircuito.id)),
        with: { circuito: true },
      });
      if (!perfil) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado en tu circuito' });
      }

      const yaPago = await db.query.pagos.findFirst({
        where: (p, { eq, and }) =>
          and(
            eq(p.perfilId, perfil.id),
            eq(p.mes, mes),
            eq(p.anio, anio),
            eq(p.estado, 'pagado'),
          ),
      });
      if (yaPago) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este residente ya tiene pago registrado este mes' });
      }

      const esReconexion = perfil.estadoAgua === 'cortado';
      const montoBase = calcularMontoBase(
        miCircuito.montoMensual,
        esReconexion,
        miCircuito.montoReconexion,
      ).toFixed(2);
      const folio = `AGU-${nanoid(10).toUpperCase()}`;

      const pago = await db.transaction(async (tx) => {
        const [nuevoPago] = await tx
          .insert(pagos)
          .values({
            perfilId: perfil.id,
            circuitoId: miCircuito.id,
            representanteId: ctx.user.id,
            mes,
            anio,
            monto: montoBase,
            montoBase,
            iva: '0.00',
            comisionMercadoPago: '0.00',
            retencionIsr: '0.00',
            retencionIva: '0.00',
            montoNetoRepresentante: montoBase,
            mercadoPagoCollectorId: miCircuito.mercadoPagoCollectorId,
            estado: 'pagado',
            metodo: input.metodo,
            folio,
            esReconexion,
            fechaPago: new Date(),
          })
          .returning();

        if (esReconexion) {
          await tx
            .update(perfilesResidente)
            .set({ estadoAgua: 'pendiente_reconexion' })
            .where(eq(perfilesResidente.id, perfil.id));

          const corteActivo = await tx.query.cortes.findFirst({
            where: (c, { eq, and }) => and(eq(c.perfilId, perfil.id), eq(c.activo, true)),
          });
          if (corteActivo) {
            await tx
              .update(cortes)
              .set({ activo: false, fechaReconexion: new Date() })
              .where(eq(cortes.id, corteActivo.id));
          }
        }

        await tx.insert(tickets).values({
          pagoId: nuevoPago.id,
          folio,
          pdfUrl: null,
        });

        return nuevoPago;
      });

      return { folio, monto: pago.monto, metodo: input.metodo };
    }),

  // ============================================
  // resumenMes: Resumen para dashboards (admin / representante)
  // ============================================
  resumenMes: roleProcedure('admin', 'representante').query(async ({ ctx }) => {
    console.log('=== resumenMes iniciado ===');
    console.log('ROL:', (ctx.user as { role?: string }).role);

    const { mes, anio } = obtenerPeriodoVigente();
    const rol = (ctx.user as { role?: string }).role;
    console.log(`PERIODO PARA RESUMEN: ${mes}/${anio}`);

    let perfiles;
    if (rol === 'admin') {
      console.log('ADMIN: obteniendo todos los perfiles...');
      perfiles = await db.query.perfilesResidente.findMany({ with: { circuito: true } });
    } else {
      console.log('REPRESENTANTE: buscando su circuito...');
      const miCircuito = await db.query.circuitos.findFirst({
        where: (c, { eq }) => eq(c.representanteId, ctx.user.id),
      });
      if (!miCircuito) {
        console.log('REPRESENTANTE SIN CIRCUITO ASIGNADO');
        return { totalDeptos: 0, pagados: 0, recaudado: 0, mes, anio, porCircuito: [] };
      }
      console.log('CIRCUITO ENCONTRADO:', miCircuito.id, miCircuito.nombre);
      perfiles = await db.query.perfilesResidente.findMany({
        where: (p, { eq }) => eq(p.circuitoId, miCircuito.id),
        with: { circuito: true },
      });
    }
    console.log(`TOTAL PERFILES: ${perfiles.length}`);

    console.log('OBTENIENDO PAGOS DEL MES...');
    const pagosDelMes = await db.query.pagos.findMany({
      where: (p, { eq, and }) => and(eq(p.mes, mes), eq(p.anio, anio), eq(p.estado, 'pagado')),
    });
    console.log(`PAGOS DEL MES: ${pagosDelMes.length}`);

    const idsPagados = new Set(pagosDelMes.map((p) => p.perfilId));
    const pagados = perfiles.filter((p) => idsPagados.has(p.id)).length;
    const recaudado = pagosDelMes
      .filter((p) => perfiles.some((perf) => perf.id === p.perfilId))
      .reduce((acc, p) => acc + parseFloat(p.monto), 0);
    console.log(`PAGADOS: ${pagados}, RECAUDADO: ${recaudado}`);

    const porCircuitoMap = new Map<string, { nombre: string; total: number; pagados: number }>();
    for (const perfil of perfiles) {
      const nombre = perfil.circuito?.nombre ?? 'Sin circuito';
      const entry = porCircuitoMap.get(nombre) ?? { nombre, total: 0, pagados: 0 };
      entry.total += 1;
      if (idsPagados.has(perfil.id)) entry.pagados += 1;
      porCircuitoMap.set(nombre, entry);
    }

    return {
      totalDeptos: perfiles.length,
      pagados,
      recaudado,
      mes,
      anio,
      porCircuito: Array.from(porCircuitoMap.values()),
    };
  }),
});

