import { NextResponse } from 'next/server';
import { db } from '@/db';
import { circuitos } from '@/db/schema';

// Evita que Next.js intente pre-renderizar esta ruta en tiempo de build
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await db.select().from(circuitos);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error en /api/circuitos:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}