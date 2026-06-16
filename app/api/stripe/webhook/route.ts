import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/db';
import { pagos, tickets, perfilesResidente, cortes } from '@/db/schema';
import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('Webhook error:', err);
    return NextResponse.json({ error: 'Webhook inválido' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const { perfilId, esReconexion, mes, anio, monto } = session.metadata!;

    try {
      const folio = `AGU-${nanoid(10).toUpperCase()}`;
      const esReconexionBool = esReconexion === 'true';

      // ✅ Registrar pago con los datos correctos
      const [pago] = await db.insert(pagos).values({
        perfilId,
        mes: parseInt(mes),
        anio: parseInt(anio),
        monto: monto || ((session.amount_total ?? 0) / 100).toFixed(2),
        estado: 'pagado',
        metodo: 'stripe',
        folio,
        esReconexion: esReconexionBool,
        fechaPago: new Date(),
      }).returning();

      // Crear ticket
      await db.insert(tickets).values({
        pagoId: pago.id,
        folio,
        pdfUrl: null,
      });

      // ✅ Si es reconexión, actualizar estado del agua
      if (esReconexionBool) {
        await db.update(perfilesResidente)
          .set({ estadoAgua: 'pendiente_reconexion' })
          .where(eq(perfilesResidente.id, perfilId));

        await db.update(cortes)
          .set({ activo: false, fechaReconexion: new Date() })
          .where(and(
            eq(cortes.perfilId, perfilId),
            eq(cortes.activo, true)
          ));
      }

      console.log(`✅ Pago registrado: ${folio} para perfil ${perfilId}`);
    } catch (error) {
      console.error('Error procesando webhook:', error);
      return NextResponse.json({ error: 'Error procesando webhook' }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}