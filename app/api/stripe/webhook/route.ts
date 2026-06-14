import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/db';
import { pagos, tickets } from '@/db/schema';
import { nanoid } from 'nanoid';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: 'Webhook inválido' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const { perfilId, esReconexion } = session.metadata!;
    const ahora = new Date();
    const folio = `AGU-${nanoid(10).toUpperCase()}`;

    const [pago] = await db.insert(pagos).values({
      perfilId,
      mes: ahora.getMonth() + 1,
      anio: ahora.getFullYear(),
      monto: esReconexion === 'true' ? '350.00' : '50.00',
      estado: 'pagado',
      metodo: 'tarjeta',
      folio,
      esReconexion: esReconexion === 'true',
      fechaPago: ahora,
    }).returning();

    await db.insert(tickets).values({
      pagoId: pago.id,
      folio,
      pdfUrl: null,
    });
  }

  return NextResponse.json({ ok: true });
}