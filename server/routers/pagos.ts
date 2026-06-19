// server/routers/pagos.ts

import { router, protectedProcedure, roleProcedure } from '../trpc';
import { z } from 'zod';
import { db } from '@/db';
import { pagos, perfilesResidente, cortes, tickets } from '@/db/schema';
import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { obtenerPeriodoVigente, esMoroso, verificarCircuitoActivo } from '../utils';
import { calcularDesglosePago, calcularMontoBase } from '../payment-calculator';

export const pagosRouter = router({
  // ============================================
  // miHistorial: Historial del residente autenticado
  // ============================================
  miHistorial: protectedProcedure.query(async ({ ctx }) => {
    console.log('=== miHistorial iniciado ===');
    console.log('USER ID:', ctx.user.id);

    const perfil = await db.query.perfilesResidente.findFirst({
      where: (p, { eq }) => eq(p.userId, ctx.user.id),
      with: { circuito: true },
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
      circuito: perfil.circuito,
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

      await verificarCircuitoActivo(ctx.user.id);

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

      // ✅ Detectar si está pendiente de corte o cortado
      const esPendienteCorte = perfil.estadoAgua === 'pendiente_corte';
      const esReconexion = perfil.estadoAgua === 'cortado';
      
      // Si está pendiente de corte, NO es reconexión (es un pago normal)
      // Si está cortado, SÍ es reconexión
      const requiereReconexion = esReconexion;
      
      const montoBase = calcularMontoBase(
        perfil.circuito.montoMensual,
        requiereReconexion,
        perfil.circuito.montoReconexion
      );
      const desglose = calcularDesglosePago(montoBase);
      const monto = desglose.total;
      console.log(`MONTO: ${monto}, ES_RECONEXION: ${requiereReconexion}`);

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
              esReconexion: requiereReconexion,
              fechaPago: new Date(),
            })
            .returning();
          console.log('PAGO INSERTADO, ID:', pago.id);

          // ✅ ACTUALIZAR ESTADO SEGÚN EL CASO
          if (esPendienteCorte) {
            // CASO 1: Estaba pendiente de corte → pasa a activo
            console.log('✅ PENDIENTE DE CORTE - Actualizando a activo...');
            await tx
              .update(perfilesResidente)
              .set({ estadoAgua: 'activo' })
              .where(eq(perfilesResidente.id, perfil.id));
            console.log('ESTADO ACTUALIZADO A activo');
          } else if (esReconexion) {
            // CASO 2: Estaba cortado → pasa a pendiente_reconexion
            console.log('✅ CORTADO - Actualizando a pendiente_reconexion...');
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
          } else {
            // CASO 3: Estaba activo → sigue activo
            console.log('✅ ACTIVO - Sin cambios en estado');
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
      return { folio, monto, esReconexion: requiereReconexion };
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

  // ============================================
  // registrarManual: Representante registra pago en efectivo
  // ============================================
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

      // ✅ Detectar si está pendiente de corte o cortado
      const esPendienteCorte = perfil.estadoAgua === 'pendiente_corte';
      const esReconexion = perfil.estadoAgua === 'cortado';
      const requiereReconexion = esReconexion;

      const montoBase = calcularMontoBase(
        miCircuito.montoMensual,
        requiereReconexion,
        miCircuito.montoReconexion,
      );
      const desglose = calcularDesglosePago(montoBase);
      const monto = desglose.total;
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
            monto,
            montoBase: desglose.montoBase,
            iva: desglose.iva,
            comisionMercadoPago: desglose.comisionMercadoPago,
            retencionIsr: desglose.retencionIsr,
            retencionIva: desglose.retencionIva,
            montoNetoRepresentante: desglose.montoNetoRepresentante,
            mercadoPagoCollectorId: miCircuito.mercadoPagoCollectorId,
            estado: 'pagado',
            metodo: input.metodo,
            folio,
            esReconexion: requiereReconexion,
            fechaPago: new Date(),
          })
          .returning();

        // ✅ ACTUALIZAR ESTADO SEGÚN EL CASO
        if (esPendienteCorte) {
          // CASO 1: Estaba pendiente de corte → pasa a activo
          console.log('✅ PENDIENTE DE CORTE - Actualizando a activo...');
          await tx
            .update(perfilesResidente)
            .set({ estadoAgua: 'activo' })
            .where(eq(perfilesResidente.id, perfil.id));
          console.log('ESTADO ACTUALIZADO A activo');
        } else if (esReconexion) {
          // CASO 2: Estaba cortado → pasa a pendiente_reconexion
          console.log('✅ CORTADO - Actualizando a pendiente_reconexion...');
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
        } else {
          // CASO 3: Estaba activo → sigue activo
          console.log('✅ ACTIVO - Sin cambios en estado');
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
  // listarFolios: Folios del residente autenticado
  // ============================================
  listarFolios: protectedProcedure.query(async ({ ctx }) => {
    const perfil = await db.query.perfilesResidente.findFirst({
      where: (p, { eq }) => eq(p.userId, ctx.user.id),
    });

    if (!perfil) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Perfil no encontrado' });
    }

    const pagosList = await db.query.pagos.findMany({
      where: (p, { eq }) => eq(p.perfilId, perfil.id),
      with: {
        perfil: {
          with: {
            usuario: true,
            circuito: true,
          },
        },
      },
      orderBy: (p, { desc }) => [desc(p.anio), desc(p.mes)],
    });

    return pagosList.map((p) => ({
      id: p.id,
      folio: p.folio,
      mes: p.mes,
      anio: p.anio,
      monto: p.monto,
      estado: p.estado,
      esReconexion: p.esReconexion,
      fechaPago: p.fechaPago,
      circuito: p.perfil?.circuito?.nombre || 'Sin circuito',
      residente: p.perfil?.usuario?.name || 'Sin nombre',
    }));
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