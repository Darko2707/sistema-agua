import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { auth } from '@/lib/auth';
import { db } from '@/db';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const perfil = await db.query.perfilesResidente.findFirst({
    where: (p, { eq }) => eq(p.userId, session.user.id),
  });
  if (!perfil) {
    return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 400 });
  }

  const esReconexion = perfil.estadoAgua === 'cortado';
  const monto = esReconexion ? 35000 : 5000; // en centavos: $350 o $50

  const checkoutSession = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'mxn',
          product_data: {
            name: esReconexion ? 'Pago mensual + Reconexión' : 'Pago mensual de agua',
            description: `Edificio ${perfil.edificio}, Depto ${perfil.departamento}`,
          },
          unit_amount: monto,
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId: session.user.id,
      perfilId: perfil.id,
      esReconexion: String(esReconexion),
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/residente?pago=ok`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/residente?pago=cancelado`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}