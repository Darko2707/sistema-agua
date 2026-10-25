import { eq, asc, isNull, and, ne } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { TRPCError } from '@trpc/server';
import { db } from '@/db';
import { user, account, session, fraccionamientos, auditoria } from '@/db/schema';
import { hashAccountPassword } from '@/lib/password';
import type {
  UserRepository,
  UserData,
  RepresentanteData,
  CreatePersonalInput,
  UpdatePersonalInput,
  CambiarRolInput,
  CambiarRolEnFraccionamientoInput,
  UserRole,
} from '@/src/application/ports/user.repository';

function toData(row: typeof user.$inferSelect): UserData {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as UserRole,
    responsableCargos: row.responsableCargos,
    fraccionamientoId: row.fraccionamientoId ?? null,
  };
}

export class DrizzleUserRepository implements UserRepository {
  async findById(id: string): Promise<UserData | null> {
    const row = await db.query.user.findFirst({ where: (u, { eq, and, isNull }) => and(eq(u.id, id), isNull(u.deletedAt)) });
    return row ? toData(row) : null;
  }

  async findByEmail(email: string): Promise<UserData | null> {
    const row = await db.query.user.findFirst({ where: (u, { eq, and, isNull }) => and(eq(u.email, email), isNull(u.deletedAt)) });
    return row ? toData(row) : null;
  }

  async create(input: CreatePersonalInput): Promise<string> {
    const userId = nanoid();
    const hashed = await hashAccountPassword(input.password);
    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: userId, name: input.nombre, email: input.email,
        role: input.role,
        fraccionamientoId: input.fraccionamientoId,
      });
      await tx.insert(account).values({
        id: nanoid(), accountId: input.email, providerId: 'credential',
        userId, password: hashed,
      });
    });
    return userId;
  }

  async update(id: string, data: UpdatePersonalInput): Promise<void> {
    const updates: Record<string, unknown> = {};
    if (data.nombre) updates.name  = data.nombre;
    if (data.email)  updates.email = data.email;
    if (data.fraccionamientoId !== undefined) updates.fraccionamientoId = data.fraccionamientoId;
    if (Object.keys(updates).length) {
      await db.update(user).set(updates).where(eq(user.id, id));
    }
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.update(account)
        .set({ password: hashedPassword, updatedAt: new Date() })
        .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')));
      await tx.delete(session).where(eq(session.userId, userId));
    });
  }

  async updateRole(id: string, role: UserRole): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, id));
      await tx.delete(session).where(eq(session.userId, id));
    });
  }

  async delete(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(session).where(eq(session.userId, id));
      await tx.update(user)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(user.id, id));
    });
  }

  async hasFinancialRecords(id: string): Promise<boolean> {
    const r1 = await db.query.ingresosAdicionales.findFirst({
      where: (ia, { eq }) => eq(ia.representanteId, id),
    });
    if (r1) return true;
    const r2 = await db.query.gastosFraccionamiento.findFirst({
      where: (g, { eq }) => eq(g.representanteId, id),
    });
    return !!r2;
  }

  async listarRepresentantes(): Promise<RepresentanteData[]> {
    const rows = await db
      .select({
        id:             user.id,
        name:           user.name,
        email:          user.email,
        responsableCargos: user.responsableCargos,
        fraccionamientoId:     fraccionamientos.id,
        fraccionamientoNombre: fraccionamientos.nombre,
      })
      .from(user)
      .leftJoin(fraccionamientos, eq(fraccionamientos.representanteId, user.id))
      .where(and(eq(user.role, 'representante'), isNull(user.deletedAt)))
      .orderBy(asc(user.name));

    return rows.map(r => ({
      id:    r.id,
      name:  r.name,
      email: r.email,
      role:  'representante' as const,
      responsableCargos: r.responsableCargos,
      fraccionamiento: r.fraccionamientoId ? { id: r.fraccionamientoId, nombre: r.fraccionamientoNombre } : null,
    }));
  }


  async listarNonResidente(): Promise<UserData[]> {
    const rows = await db.select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      responsableCargos: user.responsableCargos,
      fraccionamientoId: user.fraccionamientoId,
      fraccionamientoNombre: fraccionamientos.nombre,
    }).from(user)
      .leftJoin(fraccionamientos, eq(fraccionamientos.id, user.fraccionamientoId))
      .where(and(
        ne(user.role, 'residente'),
        ne(user.role, 'admin'),
        isNull(user.deletedAt),
      ))
      .orderBy(asc(fraccionamientos.nombre), asc(user.name));
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role as UserRole,
      responsableCargos: row.responsableCargos,
      fraccionamientoId: row.fraccionamientoId ?? null,
      fraccionamientoNombre: row.fraccionamientoNombre ?? null,
    }));
  }

  async cambiarRol({ userId, nuevoRol, actorId }: CambiarRolInput): Promise<void> {
    const existente = await db.query.user.findFirst({ where: (u, { eq }) => eq(u.id, userId) });
    if (!existente) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });

    let nuevaFraccionamientoId = existente.fraccionamientoId ?? undefined;
    let anteriorRepresentanteId: string | undefined;
    let anteriorTesoreraId: string | undefined;

    if (nuevoRol === 'representante' || nuevoRol === 'tesorera') {
      const perfil = await db.query.perfilesResidente.findFirst({
        where: (p, { eq }) => eq(p.userId, userId),
      });
      nuevaFraccionamientoId = perfil?.fraccionamientoId ?? nuevaFraccionamientoId;
      if (nuevaFraccionamientoId) {
        const fraccionamiento = await db.query.fraccionamientos.findFirst({
          where: (f, { eq }) => eq(f.id, nuevaFraccionamientoId!),
        });
        if (nuevoRol === 'representante' && fraccionamiento?.representanteId && fraccionamiento.representanteId !== userId) {
          anteriorRepresentanteId = fraccionamiento.representanteId;
        }
        if (nuevoRol === 'tesorera' && fraccionamiento?.tesoreraId && fraccionamiento.tesoreraId !== userId) {
          anteriorTesoreraId = fraccionamiento.tesoreraId;
        }
      }
    }

    if (nuevoRol !== 'admin' && !nuevaFraccionamientoId && !existente.fraccionamientoId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'El usuario no tiene fraccionamiento asignado' });
    }

    const fraccId = nuevaFraccionamientoId ?? existente.fraccionamientoId ?? null;

    await db.transaction(async (tx) => {
      if (existente.role === 'representante' && nuevoRol !== 'representante') {
        await tx.update(fraccionamientos).set({ representanteId: null, updatedAt: new Date() }).where(eq(fraccionamientos.representanteId, userId));
      }
      if (existente.role === 'tesorera' && nuevoRol !== 'tesorera') {
        await tx.update(fraccionamientos).set({ tesoreraId: null, updatedAt: new Date() }).where(eq(fraccionamientos.tesoreraId, userId));
        if (existente.fraccionamientoId) {
          await tx.insert(auditoria).values({
            actorId: actorId ?? null,
            accion: 'fraccionamiento.tesorera.desasignada',
            entidad: 'fraccionamientos',
            entidadId: existente.fraccionamientoId,
            detalle: { userId, anteriorRol: 'tesorera', nuevoRol },
          });
        }
      }
      if (fraccId && nuevoRol === 'representante') {
        await tx.update(fraccionamientos)
          .set({ representanteId: null, updatedAt: new Date() })
          .where(and(eq(fraccionamientos.representanteId, userId), ne(fraccionamientos.id, fraccId)));

        if (anteriorRepresentanteId) {
          await tx.update(user).set({ role: 'residente', updatedAt: new Date() }).where(eq(user.id, anteriorRepresentanteId));
          await tx.delete(session).where(eq(session.userId, anteriorRepresentanteId));
        }
        await tx.update(fraccionamientos).set({ representanteId: userId, updatedAt: new Date() }).where(eq(fraccionamientos.id, fraccId));
      }
      if (fraccId && nuevoRol === 'tesorera') {
        await tx.update(fraccionamientos)
          .set({ tesoreraId: null, updatedAt: new Date() })
          .where(and(eq(fraccionamientos.tesoreraId, userId), ne(fraccionamientos.id, fraccId)));

        if (anteriorTesoreraId) {
          await tx.update(user).set({ role: 'residente', updatedAt: new Date() }).where(eq(user.id, anteriorTesoreraId));
          await tx.delete(session).where(eq(session.userId, anteriorTesoreraId));
          await tx.insert(auditoria).values({
            actorId: actorId ?? null,
            accion: 'fraccionamiento.tesorera.reemplazada',
            entidad: 'fraccionamientos',
            entidadId: fraccId,
            detalle: { anteriorTesoreraId, nuevaTesoreraId: userId },
          });
        }
        await tx.update(fraccionamientos).set({ tesoreraId: userId, updatedAt: new Date() }).where(eq(fraccionamientos.id, fraccId));
        await tx.insert(auditoria).values({
          actorId: actorId ?? null,
          accion: 'fraccionamiento.tesorera.asignada',
          entidad: 'fraccionamientos',
          entidadId: fraccId,
          detalle: { userId },
        });
      }
      await tx.update(user).set({
        role: nuevoRol,
        fraccionamientoId: fraccId,
        updatedAt: new Date(),
      }).where(eq(user.id, userId));

      await tx.delete(session).where(eq(session.userId, userId));

      await tx.insert(auditoria).values({
        actorId: actorId ?? null,
        accion: 'usuario.rol.cambiado',
        entidad: 'user',
        entidadId: userId,
        detalle: { rolAnterior: existente.role, nuevoRol, fraccionamientoId: fraccId },
      });
    });
  }

  async cambiarRolEnFraccionamiento({ userId, nuevoRol, fraccionamientoId, actorId }: CambiarRolEnFraccionamientoInput): Promise<void> {
    const existente = await db.query.user.findFirst({ where: (u, { eq }) => eq(u.id, userId) });
    if (!existente) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });
    if (existente.fraccionamientoId !== fraccionamientoId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Este usuario no pertenece a tu fraccionamiento' });
    }

    await db.transaction(async (tx) => {
      if (existente.role === 'tesorera' && nuevoRol !== 'tesorera') {
        await tx.update(fraccionamientos).set({ tesoreraId: null, updatedAt: new Date() }).where(eq(fraccionamientos.tesoreraId, userId));
        await tx.insert(auditoria).values({
          actorId: actorId ?? null,
          accion: 'fraccionamiento.tesorera.desasignada',
          entidad: 'fraccionamientos',
          entidadId: fraccionamientoId,
          detalle: { userId, anteriorRol: 'tesorera', nuevoRol },
        });
      }

      if (nuevoRol === 'tesorera') {
        const [fraccionamiento] = await tx.select({ tesoreraId: fraccionamientos.tesoreraId })
          .from(fraccionamientos).where(eq(fraccionamientos.id, fraccionamientoId)).limit(1);
        if (!fraccionamiento) throw new TRPCError({ code: 'NOT_FOUND', message: 'Fraccionamiento no encontrado' });
        if (fraccionamiento.tesoreraId && fraccionamiento.tesoreraId !== userId) {
          await tx.update(user).set({ role: 'residente', updatedAt: new Date() }).where(eq(user.id, fraccionamiento.tesoreraId));
          await tx.delete(session).where(eq(session.userId, fraccionamiento.tesoreraId));
          await tx.insert(auditoria).values({
            actorId: actorId ?? null,
            accion: 'fraccionamiento.tesorera.reemplazada',
            entidad: 'fraccionamientos',
            entidadId: fraccionamientoId,
            detalle: { anteriorTesoreraId: fraccionamiento.tesoreraId, nuevaTesoreraId: userId },
          });
        }
        await tx.update(fraccionamientos).set({ tesoreraId: userId, updatedAt: new Date() }).where(eq(fraccionamientos.id, fraccionamientoId));
        await tx.insert(auditoria).values({
          actorId: actorId ?? null,
          accion: 'fraccionamiento.tesorera.asignada',
          entidad: 'fraccionamientos',
          entidadId: fraccionamientoId,
          detalle: { userId },
        });
      }

      await tx.update(user).set({
        role: nuevoRol,
        fraccionamientoId,
        updatedAt: new Date(),
      }).where(eq(user.id, userId));

      await tx.delete(session).where(eq(session.userId, userId));

      await tx.insert(auditoria).values({
        actorId: actorId ?? null,
        accion: 'usuario.rol.cambiado',
        entidad: 'user',
        entidadId: userId,
        detalle: { rolAnterior: existente.role, nuevoRol, fraccionamientoId },
      });
    });
  }
}
