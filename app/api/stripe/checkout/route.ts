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

  const ahora = new Date();
  const mes = ahora.getMonth() + 1;
  const anio = ahora.getFullYear();

  // Verificar si ya pagó este mes
  const yaPago = await db.query.pagos.findFirst({
    where: (p, { eq, and }) =>
      and(eq(p.perfilId, perfil.id), eq(p.mes, mes), eq(p.anio, anio), eq(p.estado, 'pagado')),
  });
  if (yaPago) {
    return NextResponse.json({ error: 'Ya pagaste este mes' }, { status: 400 });
  }

  // ✅ CORREGIDO: Calcular monto según estado del agua
  // - Si está 'cortado' → $350 (50 + 300 de reconexión)
  // - Si está 'pendiente_corte' → $50 (solo mensualidad, aún no cortado físicamente)
  // - Si está 'activo' → $50
  const esReconexion = perfil.estadoAgua === 'cortado';
  const montoEnCentavos = esReconexion ? 35000 : 5000; // $350 o $50

  const checkoutSession = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'mxn',
          product_data: {
            name: esReconexion ? 'Pago mensual + Reconexión' : 'Pago mensual de agua',
            description: `Edificio ${perfil.edificio}, Depto ${perfil.departamento} - ${mes}/${anio}`,
          },
          unit_amount: montoEnCentavos,
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId: session.user.id,
      perfilId: perfil.id,
      esReconexion: String(esReconexion),
      mes: String(mes),     // ✅ AGREGADO
      anio: String(anio),   // ✅ AGREGADO
      monto: String(montoEnCentavos / 100), // ✅ AGREGADO
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/residente?pago=ok`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/residente?pago=cancelado`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}