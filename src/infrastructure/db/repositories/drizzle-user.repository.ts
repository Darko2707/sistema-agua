import { eq, ne, asc, isNull, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import { TRPCError } from '@trpc/server';
import { db } from '@/db';
import { user, account, circuitos, perfilesResidente } from '@/db/schema';
import type {
  UserRepository,
  UserData,
  RepresentanteData,
  TesoreraData,
  CreatePersonalInput,
  UpdatePersonalInput,
  CambiarRolInput,
  CambiarRolEnCircuitoInput,
  UserRole,
} from '@/src/application/ports/user.repository';

function toData(row: typeof user.$inferSelect): UserData {
  return { id: row.id, name: row.name, email: row.email, role: row.role as UserRole };
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
    const hashed = await bcrypt.hash(input.password, 10);
    await db.insert(user).values({
      id: userId, name: input.nombre, email: input.email,
      role: input.role, emailVerified: true,
    });
    await db.insert(account).values({
      id: nanoid(), accountId: input.email, providerId: 'credential',
      userId, password: hashed,
    });
    return userId;
  }

  async update(id: string, data: UpdatePersonalInput): Promise<void> {
    const updates: Record<string, unknown> = {};
    if (data.nombre) updates.name  = data.nombre;
    if (data.email)  updates.email = data.email;
    if (Object.keys(updates).length) {
      await db.update(user).set(updates).where(eq(user.id, id));
    }
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await db.update(account).set({ password: hashedPassword }).where(eq(account.userId, userId));
  }

  async updateRole(id: string, role: UserRole): Promise<void> {
    await db.update(user).set({ role }).where(eq(user.id, id));
  }

  async delete(id: string): Promise<void> {
    // Soft delete: preserve audit trail and FK integrity
    await db.update(user).set({ deletedAt: new Date() }).where(eq(user.id, id));
  }

  async hasFinancialRecords(id: string): Promise<boolean> {
    const r1 = await db.query.ingresosAdicionales.findFirst({
      where: (ia, { eq }) => eq(ia.representanteId, id),
    });
    if (r1) return true;
    const r2 = await db.query.gastosCircuito.findFirst({
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
        circuitoId:     circuitos.id,
        circuitoNombre: circuitos.nombre,
      })
      .from(user)
      .leftJoin(circuitos, eq(circuitos.representanteId, user.id))
      .where(and(eq(user.role, 'representante'), isNull(user.deletedAt)))
      .orderBy(asc(user.name));

    return rows.map(r => ({
      id:    r.id,
      name:  r.name,
      email: r.email,
      role:  'representante' as const,
      circuito: r.circuitoId ? { id: r.circuitoId, nombre: r.circuitoNombre } : null,
    }));
  }

  async listarTesoreras(): Promise<TesoreraData[]> {
    const rows = await db
      .select({
        id:                     user.id,
        name:                   user.name,
        email:                  user.email,
        circuitoId:             circuitos.id,
        circuitoNombre:         circuitos.nombre,
        mercadoPagoCollectorId: circuitos.mercadoPagoCollectorId,
      })
      .from(user)
      .leftJoin(circuitos, eq(circuitos.tesoreraId, user.id))
      .where(and(eq(user.role, 'tesorera'), isNull(user.deletedAt)))
      .orderBy(asc(user.name));

    return rows.map(t => ({
      id:    t.id,
      name:  t.name,
      email: t.email,
      role:  'tesorera' as const,
      circuito: t.circuitoId
        ? { id: t.circuitoId, nombre: t.circuitoNombre, mercadoPagoCollectorId: t.mercadoPagoCollectorId }
        : null,
    }));
  }

  async listarNonResidente(): Promise<UserData[]> {
    const rows = await db.query.user.findMany({
      where: (u, { ne, and, isNull }) => and(ne(u.role, 'residente'), isNull(u.deletedAt)),
      orderBy: (u, { desc }) => [desc(u.createdAt)],
    });
    return rows.map(toData);
  }

  async listarPorCircuito(circuitoId: string): Promise<UserData[]> {
    const perfiles = await db.query.perfilesResidente.findMany({
      where: (p, { eq }) => eq(p.circuitoId, circuitoId),
      with: { usuario: true },
    });
    return perfiles
      .filter(p => p.usuario?.role && !['admin', 'representante', 'residente'].includes(p.usuario.role))
      .map(p => toData(p.usuario!));
  }

  async cambiarRol({ userId, nuevoRol }: CambiarRolInput): Promise<void> {
    const existente = await db.query.user.findFirst({ where: (u, { eq }) => eq(u.id, userId) });
    if (!existente) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });

    let nuevaCircuitoId: string | undefined;
    let anteriorTesoreraId: string | undefined;

    if (nuevoRol === 'tesorera') {
      const perfil = await db.query.perfilesResidente.findFirst({
        where: (p, { eq }) => eq(p.userId, userId),
      });
      if (perfil?.circuitoId) {
        nuevaCircuitoId = perfil.circuitoId;
        const circ = await db.query.circuitos.findFirst({
          where: (c, { eq }) => eq(c.id, perfil.circuitoId!),
        });
        if (circ?.tesoreraId && circ.tesoreraId !== userId) {
          anteriorTesoreraId = circ.tesoreraId;
        }
      }
    }

    await db.transaction(async (tx) => {
      if (existente.role === 'representante' && nuevoRol !== 'representante') {
        await tx.update(circuitos).set({ representanteId: null }).where(eq(circuitos.representanteId, userId));
      }
      if (existente.role === 'tesorera' && nuevoRol !== 'tesorera') {
        await tx.update(circuitos).set({ tesoreraId: null }).where(eq(circuitos.tesoreraId, userId));
      }
      if (nuevaCircuitoId) {
        if (anteriorTesoreraId) {
          await tx.update(user).set({ role: 'residente' }).where(eq(user.id, anteriorTesoreraId));
        }
        await tx.update(circuitos).set({ tesoreraId: userId }).where(eq(circuitos.id, nuevaCircuitoId));
      }
      await tx.update(user).set({ role: nuevoRol }).where(eq(user.id, userId));
    });
  }

  async cambiarRolEnCircuito({ userId, nuevoRol, circuitoId }: CambiarRolEnCircuitoInput): Promise<void> {
    const perfil = await db.query.perfilesResidente.findFirst({
      where: (p, { eq }) => eq(p.userId, userId),
    });
    if (!perfil || perfil.circuitoId !== circuitoId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Este usuario no pertenece a tu circuito' });
    }

    const existente = await db.query.user.findFirst({ where: (u, { eq }) => eq(u.id, userId) });
    if (!existente) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });

    const circ = nuevoRol === 'tesorera'
      ? await db.query.circuitos.findFirst({ where: (c, { eq }) => eq(c.id, circuitoId) })
      : null;

    await db.transaction(async (tx) => {
      if (existente.role === 'tesorera' && nuevoRol !== 'tesorera') {
        await tx.update(circuitos).set({ tesoreraId: null }).where(eq(circuitos.tesoreraId, userId));
      }
      await tx.update(user).set({ role: nuevoRol }).where(eq(user.id, userId));
      if (nuevoRol === 'tesorera') {
        if (circ?.tesoreraId && circ.tesoreraId !== userId) {
          await tx.update(user).set({ role: 'residente' }).where(eq(user.id, circ.tesoreraId));
        }
        await tx.update(circuitos).set({ tesoreraId: userId }).where(eq(circuitos.id, circuitoId));
      }
    });
  }
}
