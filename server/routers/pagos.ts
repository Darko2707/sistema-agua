import { router, protectedProcedure, roleProcedure } from '../trpc';
import { z } from 'zod';
import { db } from '@/db';
import { pagos, perfilesResidente, cortes, tickets } from '@/db/schema';
import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

const MONTO_MENSUAL = '50.00';
const MONTO_RECONEXION = '300.00';

export const pagosRouter = router({
  miHistorial: protectedProcedure.query(async ({ ctx }) => {
    console.log('=== miHistorial iniciado ===');
    console.log('USER ID:', ctx.user.id);
    
    const perfil = await db.query.perfilesResidente.findFirst({
      where: (p, { eq }) => eq(p.userId, ctx.user.id),
    });
    console.log('PERFIL ENCONTRADO:', perfil ? perfil.id : 'NO ENCONTRADO');
    
    if (!perfil) return { perfil: null, pagos: [], corteActivo: false };

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

    return { perfil, pagos: historial, corteActivo: !!corteActivo };
  }),

  pagar: protectedProcedure
    .input(z.object({ metodo: z.enum(['transferencia', 'efectivo']) }))
    .mutation(async ({ ctx, input }) => {
      console.log('=== PAGAR iniciado ===');
      console.log('USER ID:', ctx.user.id);
      console.log('METODO:', input.metodo);
      
      const perfil = await db.query.perfilesResidente.findFirst({
        where: (p, { eq }) => eq(p.userId, ctx.user.id),
      });
      console.log('PERFIL ENCONTRADO:', perfil ? perfil.id : 'NO ENCONTRADO');
      
      if (!perfil) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Completa tu perfil primero' });

      const ahora = new Date();
      const mes = ahora.getMonth() + 1;
      const anio = ahora.getFullYear();
      console.log(`PERIODO: ${mes}/${anio}`);

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

      console.log('VERIFICANDO CORTE ACTIVO...');
      const corteActivo = await db.query.cortes.findFirst({
        where: (c, { eq, and }) => and(eq(c.perfilId, perfil.id), eq(c.activo, true)),
      });
      console.log('CORTE ACTIVO:', corteActivo ? `SI (id: ${corteActivo.id})` : 'NO');

      const esReconexion = !!corteActivo;
      const monto = esReconexion
        ? (parseFloat(MONTO_MENSUAL) + parseFloat(MONTO_RECONEXION)).toFixed(2)
        : MONTO_MENSUAL;
      console.log(`MONTO: ${monto}, ES_RECONEXION: ${esReconexion}`);

      const folio = `AGU-${nanoid(10).toUpperCase()}`;
      console.log('FOLIO GENERADO:', folio);

      console.log('=== INICIANDO TRANSACCION ===');
      const result = await db.transaction(async (tx) => {
        console.log('DENTRO DE TRANSACCION - INSERTANDO PAGO...');
        const [pago] = await tx
          .insert(pagos)
          .values({
            perfilId: perfil.id,
            mes,
            anio,
            monto,
            estado: 'pagado',
            metodo: input.metodo,
            folio,
            esReconexion,
            fechaPago: new Date(),
          })
          .returning();
        console.log('PAGO INSERTADO, ID:', pago.id);

        if (corteActivo) {
          console.log('ACTUALIZANDO CORTE (desactivando)...');
          await tx
            .update(cortes)
            .set({ activo: false, fechaReconexion: new Date() })
            .where(eq(cortes.id, corteActivo.id));
          console.log('CORTE ACTUALIZADO');

          console.log('ACTUALIZANDO ESTADO DEL AGUA DEL PERFIL...');
          await tx
            .update(perfilesResidente)
            .set({ estadoAgua: 'activo' })
            .where(eq(perfilesResidente.id, perfil.id));
          console.log('ESTADO DEL AGUA ACTUALIZADO');
        }

        return pago;
      });
      console.log('=== TRANSACCION COMPLETADA ===');

      console.log('INSERTANDO TICKET (sin PDF)...');
      await db.insert(tickets).values({
        pagoId: result.id,
        folio,
        pdfUrl: null,
      });
      console.log('TICKET INSERTADO, FOLIO:', folio);

      console.log('=== PAGO COMPLETADO EXITOSAMENTE ===');
      return { folio, monto, esReconexion };
    }),

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

  resumenMes: roleProcedure('admin', 'representante').query(async ({ ctx }) => {
    console.log('=== resumenMes iniciado ===');
    console.log('ROL:', (ctx.user as any).role);
    
    const ahora = new Date();
    const mes = ahora.getMonth() + 1;
    const anio = ahora.getFullYear();
    const rol = (ctx.user as any).role;
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
        return { totalDeptos: 0, pagados: 0, recaudado: 0, porCircuito: [] };
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
      porCircuito: Array.from(porCircuitoMap.values()),
    };
  }),
});