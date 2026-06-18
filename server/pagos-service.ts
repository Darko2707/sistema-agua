import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { db } from '@/db';
import { cortes, pagos, perfilesResidente, tickets } from '@/db/schema';
import { calcularDesglosePago } from './payment-calculator';

type RegistrarPagoInput = {
  perfilId: string;
  mes: number;
  anio: number;
  monto: string;
  metodo: string;
  esReconexion: boolean;
  mercadoPagoPaymentId?: string;
  mercadoPagoCollectorId?: string | null;
};

export async function registrarPagoAprobado(input: RegistrarPagoInput) {
  const perfil = await db.query.perfilesResidente.findFirst({
    where: (p, { eq }) => eq(p.id, input.perfilId),
  });

  if (!perfil) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Perfil no encontrado' });
  }

  const circuito = await db.query.circuitos.findFirst({
    where: (c, { eq }) => eq(c.id, perfil.circuitoId),
  });

  if (!circuito) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Circuito no encontrado' });
  }

  const pagoExistente = await db.query.pagos.findFirst({
    where: (p, { eq, and }) =>
      and(
        eq(p.perfilId, input.perfilId),
        eq(p.mes, input.mes),
        eq(p.anio, input.anio),
        eq(p.estado, 'pagado')
      ),
  });

  if (pagoExistente) {
    return {
      folio: pagoExistente.folio,
      monto: pagoExistente.monto,
      esReconexion: pagoExistente.esReconexion ?? false,
      pago: pagoExistente,
      yaRegistrado: true,
    };
  }

  const folio = `AGU-${nanoid(10).toUpperCase()}`;
  const desglose = calcularDesglosePago(Number(input.monto));

  const pago = await db.transaction(async (tx) => {
    const [nuevoPago] = await tx
      .insert(pagos)
        .values({
          perfilId: input.perfilId,
          circuitoId: circuito.id,
          representanteId: circuito.representanteId,
          mes: input.mes,
          anio: input.anio,
          monto: desglose.total,
          montoBase: desglose.montoBase,
          iva: desglose.iva,
          comisionMercadoPago: desglose.comisionMercadoPago,
          retencionIsr: desglose.retencionIsr,
          retencionIva: desglose.retencionIva,
          montoNetoRepresentante: desglose.montoNetoRepresentante,
          mercadoPagoPaymentId: input.mercadoPagoPaymentId,
          mercadoPagoCollectorId: input.mercadoPagoCollectorId ?? circuito.mercadoPagoCollectorId,
          estado: 'pagado',
        metodo: input.metodo,
        folio,
        esReconexion: input.esReconexion,
        fechaPago: new Date(),
      })
      .returning();

    if (input.esReconexion) {
      await tx
        .update(perfilesResidente)
        .set({ estadoAgua: 'pendiente_reconexion' })
        .where(eq(perfilesResidente.id, input.perfilId));

      const corteActivo = await tx.query.cortes.findFirst({
        where: (c, { eq, and }) => and(eq(c.perfilId, input.perfilId), eq(c.activo, true)),
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

  return {
    folio,
    monto: desglose.total,
    esReconexion: input.esReconexion,
    pago,
    yaRegistrado: false,
  };
}
