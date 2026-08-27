import { createHash, randomInt } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  account,
  auditoria,
  circuitos,
  passwordResetCodes,
  passwordResetRequests,
  perfilesResidente,
  session,
  user as users,
} from '@/db/schema';
import { hashAccountPassword } from '@/lib/password';
import { isRepresentativeResetCodeValid } from '@/src/domain/usuarios/representative-reset-code';

export const REPRESENTATIVE_RESET_CODE_TTL_MS = 10 * 60 * 1000;
export const REPRESENTATIVE_RESET_CODE_MAX_ATTEMPTS = 5;

const INVALID_CODE_MESSAGE = 'Codigo invalido o expirado';

export function hashRepresentativeResetCode(code: string): string {
  if (!isRepresentativeResetCodeValid(code)) {
    throw new TypeError('El codigo de recuperacion debe contener exactamente 6 digitos');
  }
  return createHash('sha256')
    .update(code)
    .digest('hex');
}

export function representativeResetCodeExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + REPRESENTATIVE_RESET_CODE_TTL_MS);
}

function generateSixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

type GenerateInput = {
  representanteId: string;
  perfilId: string;
};

type RequestInput = {
  email: string;
};

type RedeemInput = {
  email: string;
  code: string;
  newPassword: string;
};

export class RepresentativePasswordResetService {
  async requestForResident(input: RequestInput): Promise<void> {
    const email = input.email.trim().toLowerCase();
    const [resident] = await db
      .select({
        userId:   users.id,
        perfilId: perfilesResidente.id,
      })
      .from(users)
      .innerJoin(perfilesResidente, eq(perfilesResidente.userId, users.id))
      .innerJoin(circuitos, eq(circuitos.id, perfilesResidente.circuitoId))
      .where(and(
        sql`lower(${users.email}) = ${email}`,
        eq(users.role, 'residente'),
        isNull(users.deletedAt),
        eq(circuitos.activo, true),
      ))
      .limit(1);

    // La respuesta publica siempre es la misma para no confirmar si una
    // direccion tiene cuenta. Repetir mientras sigue pendiente es idempotente.
    if (!resident) return;

    await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(passwordResetRequests)
        .values({
          userId:   resident.userId,
          perfilId: resident.perfilId,
        })
        .onConflictDoNothing()
        .returning({ id: passwordResetRequests.id });

      if (inserted.length === 0) return;

      await tx.insert(auditoria).values({
        actorId:   null,
        accion:    'password_reset.solicitud_creada',
        entidad:   'user',
        entidadId: resident.userId,
        detalle: {
          perfilId: resident.perfilId,
          requestId: inserted[0].id,
        },
      });
    });
  }

  async listPendingForRepresentative(representanteId: string) {
    const pending = await db
      .select({
        perfilId:     passwordResetRequests.perfilId,
        requestedAt:  passwordResetRequests.requestedAt,
        nombre:       users.name,
        email:        users.email,
        edificio:     perfilesResidente.edificio,
        departamento: perfilesResidente.departamento,
      })
      .from(passwordResetRequests)
      .innerJoin(
        perfilesResidente,
        eq(perfilesResidente.id, passwordResetRequests.perfilId),
      )
      .innerJoin(circuitos, eq(circuitos.id, perfilesResidente.circuitoId))
      .innerJoin(users, eq(users.id, passwordResetRequests.userId))
      .where(and(
        eq(circuitos.representanteId, representanteId),
        eq(circuitos.activo, true),
        eq(users.role, 'residente'),
        isNull(users.deletedAt),
        isNull(passwordResetRequests.generatedAt),
      ))
      .orderBy(desc(passwordResetRequests.requestedAt));

    return pending.map((solicitud) => ({
      perfilId:     solicitud.perfilId,
      pendiente:    true as const,
      requestedAt:  solicitud.requestedAt,
      nombre:       solicitud.nombre,
      email:        solicitud.email,
      edificio:     solicitud.edificio,
      departamento: solicitud.departamento,
    }));
  }

  async generateForResident(input: GenerateInput) {
    const [resident] = await db
      .select({
        perfilId:        perfilesResidente.id,
        userId:          perfilesResidente.userId,
        edificio:        perfilesResidente.edificio,
        departamento:    perfilesResidente.departamento,
        residenteNombre: users.name,
        residenteEmail:  users.email,
        residenteRole:   users.role,
        circuitoNombre:  circuitos.nombre,
      })
      .from(perfilesResidente)
      .innerJoin(users, eq(users.id, perfilesResidente.userId))
      .innerJoin(circuitos, eq(circuitos.id, perfilesResidente.circuitoId))
      .where(and(
        eq(perfilesResidente.id, input.perfilId),
        eq(circuitos.representanteId, input.representanteId),
        isNull(users.deletedAt),
      ))
      .limit(1);

    if (!resident || resident.residenteRole !== 'residente') {
      throw new TRPCError({
        code:    'FORBIDDEN',
        message: 'Solo puedes generar codigos para residentes de tu circuito',
      });
    }

    const now = new Date();
    const code = generateSixDigitCode();
    const expiresAt = representativeResetCodeExpiresAt(now);

    await db.transaction(async (tx) => {
      // Orden global de locks para reset: el perfil siempre va primero. Este
      // lock serializa generate/redeem antes de tocar solicitudes o codigos.
      // Ademas revalida el alcance dentro de la transaccion y cierra TOCTOU.
      const [authorizedResident] = await tx
        .select({
          perfilId: perfilesResidente.id,
          userId:   perfilesResidente.userId,
        })
        .from(perfilesResidente)
        .innerJoin(users, eq(users.id, perfilesResidente.userId))
        .innerJoin(circuitos, eq(circuitos.id, perfilesResidente.circuitoId))
        .where(and(
          eq(perfilesResidente.id, input.perfilId),
          eq(perfilesResidente.userId, resident.userId),
          eq(circuitos.representanteId, input.representanteId),
          eq(circuitos.activo, true),
          eq(users.role, 'residente'),
          isNull(users.deletedAt),
        ))
        .limit(1)
        .for('update');

      if (!authorizedResident) {
        throw new TRPCError({
          code:    'FORBIDDEN',
          message: 'Solo puedes generar codigos para residentes de tu circuito',
        });
      }

      // UPDATE condicional = consumo atomico. Dos pestañas o representantes no
      // pueden generar dos codigos a partir de la misma solicitud.
      const claimedRequests = await tx
        .update(passwordResetRequests)
        .set({
          generatedAt: now,
          generatedBy: input.representanteId,
        })
        .where(and(
          eq(passwordResetRequests.userId, resident.userId),
          eq(passwordResetRequests.perfilId, resident.perfilId),
          isNull(passwordResetRequests.generatedAt),
        ))
        .returning({ id: passwordResetRequests.id });

      if (claimedRequests.length !== 1) {
        throw new TRPCError({
          code:    'CONFLICT',
          message: 'El residente no tiene una solicitud de recuperacion pendiente',
        });
      }

      // Mantener un solo codigo vivo por cuenta evita confusiones operativas.
      await tx
        .update(passwordResetCodes)
        .set({ usedAt: now })
        .where(and(
          eq(passwordResetCodes.userId, resident.userId),
          isNull(passwordResetCodes.usedAt),
        ));

      await tx.insert(passwordResetCodes).values({
        userId:          resident.userId,
        perfilId:        resident.perfilId,
        representanteId: input.representanteId,
        codeHash:        hashRepresentativeResetCode(code),
        expiresAt,
      });

      await tx.insert(auditoria).values({
        actorId:   input.representanteId,
        accion:    'password_reset.codigo_generado',
        entidad:   'user',
        entidadId: resident.userId,
        detalle: {
          perfilId:     resident.perfilId,
          requestId:    claimedRequests[0].id,
          edificio:     resident.edificio,
          departamento: resident.departamento,
          expiresAt:    expiresAt.toISOString(),
        },
      });
    });

    return {
      code,
      expiresAt,
      residente: {
        nombre:       resident.residenteNombre,
        email:        resident.residenteEmail,
        edificio:     resident.edificio,
        departamento: resident.departamento,
        circuito:     resident.circuitoNombre,
      },
    };
  }

  async redeem(input: RedeemInput): Promise<void> {
    const email = input.email.trim().toLowerCase();
    const code = input.code;
    if (!isRepresentativeResetCodeValid(code)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: INVALID_CODE_MESSAGE });
    }

    const submittedCodeHash = hashRepresentativeResetCode(code);
    const lookupNow = new Date();
    // Una sola consulta barata cubre tanto la cuenta como su challenge activo;
    // correo inexistente y residente sin codigo siguen la misma ruta generica.
    const [preliminaryChallenge] = await db
      .select({
        id:       passwordResetCodes.id,
        codeHash: passwordResetCodes.codeHash,
        userId:   users.id,
        perfilId: perfilesResidente.id,
        circuitoId: perfilesResidente.circuitoId,
      })
      .from(users)
      .innerJoin(perfilesResidente, eq(perfilesResidente.userId, users.id))
      .innerJoin(circuitos, eq(circuitos.id, perfilesResidente.circuitoId))
      .innerJoin(passwordResetCodes, eq(passwordResetCodes.userId, users.id))
      .where(and(
        sql`lower(${users.email}) = ${email}`,
        eq(users.role, 'residente'),
        isNull(users.deletedAt),
        eq(circuitos.activo, true),
        isNull(passwordResetCodes.usedAt),
        gt(passwordResetCodes.expiresAt, lookupNow),
      ))
      .orderBy(desc(passwordResetCodes.createdAt))
      .limit(1);

    if (!preliminaryChallenge) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: INVALID_CODE_MESSAGE });
    }

    // Scrypt es deliberadamente condicional al hash barato preliminar y nunca
    // se ejecuta manteniendo locks. La lectura bajo FOR UPDATE sigue siendo la
    // autoridad para attempts, expiracion y consumo.
    const hashedPassword = preliminaryChallenge.codeHash === submittedCodeHash
      ? await hashAccountPassword(input.newPassword)
      : null;
    const now = new Date();

    const redeemed = await db.transaction(async (tx) => {
      // Orden global de locks para reset: perfil primero. Al ser exclusivo,
      // serializa generate/redeem antes de que cualquiera toque challenge o
      // solicitud y elimina ciclos code <-> request (deadlock).
      const [lockedProfile] = await tx
        .select({ id: perfilesResidente.id })
        .from(perfilesResidente)
        .innerJoin(users, eq(users.id, perfilesResidente.userId))
        .innerJoin(circuitos, eq(circuitos.id, perfilesResidente.circuitoId))
        .where(and(
          eq(perfilesResidente.id, preliminaryChallenge.perfilId),
          eq(perfilesResidente.userId, preliminaryChallenge.userId),
          eq(perfilesResidente.circuitoId, preliminaryChallenge.circuitoId),
          eq(users.id, preliminaryChallenge.userId),
          eq(users.role, 'residente'),
          isNull(users.deletedAt),
          eq(circuitos.id, preliminaryChallenge.circuitoId),
          eq(circuitos.activo, true),
        ))
        .limit(1)
        .for('update');

      if (!lockedProfile) return false;

      // Serializa todos los intentos para este challenge. Tras esperar el lock,
      // PostgreSQL devuelve attempts/usedAt actuales y no una lectura obsoleta.
      const [challenge] = await tx
        .select()
        .from(passwordResetCodes)
        .where(and(
          eq(passwordResetCodes.id, preliminaryChallenge.id),
          eq(passwordResetCodes.userId, preliminaryChallenge.userId),
          isNull(passwordResetCodes.usedAt),
          gt(passwordResetCodes.expiresAt, now),
        ))
        .limit(1)
        .for('update');

      if (!challenge) return false;

      if (challenge.attempts >= REPRESENTATIVE_RESET_CODE_MAX_ATTEMPTS) {
        await tx
          .update(passwordResetCodes)
          .set({ usedAt: now })
          .where(and(
            eq(passwordResetCodes.id, challenge.id),
            isNull(passwordResetCodes.usedAt),
          ));
        return false;
      }

      if (challenge.codeHash !== submittedCodeHash) {
        const nextAttempts = challenge.attempts + 1;
        await tx
          .update(passwordResetCodes)
          .set({
            attempts: nextAttempts,
            ...(nextAttempts >= REPRESENTATIVE_RESET_CODE_MAX_ATTEMPTS ? { usedAt: now } : {}),
          })
          .where(and(
            eq(passwordResetCodes.id, challenge.id),
            eq(passwordResetCodes.attempts, challenge.attempts),
            isNull(passwordResetCodes.usedAt),
            gt(passwordResetCodes.expiresAt, now),
          ));
        return false;
      }

      // codeHash es inmutable para un challenge. Esta defensa evita consumir
      // si una futura migracion cambiara esa premisa entre ambas lecturas.
      if (!hashedPassword) return false;

      const consumed = await tx
        .update(passwordResetCodes)
        .set({ usedAt: now })
        .where(and(
          eq(passwordResetCodes.id, challenge.id),
          eq(passwordResetCodes.attempts, challenge.attempts),
          isNull(passwordResetCodes.usedAt),
          gt(passwordResetCodes.expiresAt, now),
        ))
        .returning({ id: passwordResetCodes.id });

      if (consumed.length === 0) {
        return false;
      }

      let updatedAccounts = await tx
        .update(account)
        .set({ password: hashedPassword, updatedAt: now })
        .where(and(eq(account.userId, preliminaryChallenge.userId), eq(account.providerId, 'credential')))
        .returning({ id: account.id });

      if (updatedAccounts.length === 0) {
        updatedAccounts = await tx
          .update(account)
          .set({ password: hashedPassword, updatedAt: now })
          .where(and(eq(account.userId, preliminaryChallenge.userId), isNotNull(account.password)))
          .returning({ id: account.id });
      }

      if (updatedAccounts.length === 0) {
        throw new TRPCError({
          code:    'CONFLICT',
          message: 'La cuenta no tiene acceso con contrasena local',
        });
      }

      await tx.delete(session).where(eq(session.userId, preliminaryChallenge.userId));

      // Si el residente alcanzo a usar el codigo anterior despues de pedir uno
      // nuevo, ya recupero la cuenta. Cerrar el pendiente evita que el
      // representante vea una accion obsoleta. generatedBy queda null porque
      // esta solicitud no produjo un codigo nuevo.
      await tx
        .update(passwordResetRequests)
        .set({ generatedAt: now, generatedBy: null })
        .where(and(
          eq(passwordResetRequests.userId, preliminaryChallenge.userId),
          isNull(passwordResetRequests.generatedAt),
        ));

      await tx.insert(auditoria).values({
        actorId:   null,
        accion:    'password_reset.codigo_usado',
        entidad:   'user',
        entidadId: preliminaryChallenge.userId,
        detalle: {
          perfilId: preliminaryChallenge.perfilId,
          via:      'representante',
        },
      });

      return true;
    });

    if (!redeemed) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: INVALID_CODE_MESSAGE });
    }
  }
}

export const representativePasswordResetService = new RepresentativePasswordResetService();
