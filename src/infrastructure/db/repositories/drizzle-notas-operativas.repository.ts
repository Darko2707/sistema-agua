import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { notasOperativas, user } from '@/db/schema';
import type {
  NotasOperativasRepository,
  NotaOperativaData,
  CrearNotaOperativaInput,
} from '@/src/application/ports/notas-operativas.repository';

export class DrizzleNotasOperativasRepository implements NotasOperativasRepository {
  async listarPorFraccionamiento(fraccionamientoId: string, rolConsulta?: string): Promise<NotaOperativaData[]> {
    const whereClause = rolConsulta
      ? and(
          eq(notasOperativas.fraccionamientoId, fraccionamientoId),
          or(
            isNull(notasOperativas.rolDestino),
            eq(notasOperativas.rolDestino, rolConsulta),
          ),
        )
      : eq(notasOperativas.fraccionamientoId, fraccionamientoId);

    const rows = await db
      .select({
        id: notasOperativas.id,
        fraccionamientoId: notasOperativas.fraccionamientoId,
        autorId: notasOperativas.autorId,
        rolAutor: notasOperativas.rolAutor,
        rolDestino: notasOperativas.rolDestino,
        contenido: notasOperativas.contenido,
        createdAt: notasOperativas.createdAt,
        autorNombre: user.name,
        autorEmail: user.email,
      })
      .from(notasOperativas)
      .innerJoin(user, eq(user.id, notasOperativas.autorId))
      .where(whereClause)
      .orderBy(desc(notasOperativas.createdAt));

    return rows;
  }

  async crear(input: CrearNotaOperativaInput): Promise<NotaOperativaData> {
    const [nota] = await db
      .insert(notasOperativas)
      .values({
        fraccionamientoId: input.fraccionamientoId,
        autorId: input.autorId,
        rolAutor: input.rolAutor,
        rolDestino: input.rolDestino,
        contenido: input.contenido,
      })
      .returning();

    return nota;
  }
}

export const notasOperativasRepo = new DrizzleNotasOperativasRepository();
