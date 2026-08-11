import { createHash, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  account,
  auditoria,
  circuitos,
  passwordResetCodes,
  perfilesResidente,
  session,
  user as users,
} from '@/db/schema';

export const REPRESENTATIVE_RESET_CODE_TTL_MS = 10 * 60 * 1000;
export const REPRESENTATIVE_RESET_CODE_MAX_ATTEMPTS = 5;

const INVALID_CODE_MESSAGE = 'Codigo invalido o expirado';

export function normalizeRepresentativeResetCode(input: string): string {
  return input.replace(/\D/g, '');
}

export function isRepresentativeResetCodeValid(input: string): boolean {
  return /^\d{6}$/.test(normalizeRepresentativeResetCode(input));
}

export function hashRepresentativeResetCode(code: string): string {
  return createHash('sha256')
    .update(normalizeRepresentativeResetCode(code))
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

type RedeemInput = {
  email: string;
  code: string;
  newPassword: string;
};

export class RepresentativePasswordResetService {
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
    const code = normalizeRepresentativeResetCode(input.code);
    if (!isRepresentativeResetCodeValid(code)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: INVALID_CODE_MESSAGE });
    }

    const now = new Date();
    const [resident] = await db
      .select({
        userId:   users.id,
        perfilId: perfilesResidente.id,
      })
      .from(users)
      .innerJoin(perfilesResidente, eq(perfilesResidente.userId, users.id))
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    if (!resident) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: INVALID_CODE_MESSAGE });
    }

    const [challenge] = await db
      .select()
      .from(passwordResetCodes)
      .where(and(
        eq(passwordResetCodes.userId, resident.userId),
        isNull(passwordResetCodes.usedAt),
        gt(passwordResetCodes.expiresAt, now),
      ))
      .orderBy(desc(passwordResetCodes.createdAt))
      .limit(1);

    if (!challenge || challenge.attempts >= REPRESENTATIVE_RESET_CODE_MAX_ATTEMPTS) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: INVALID_CODE_MESSAGE });
    }

    if (challenge.codeHash !== hashRepresentativeResetCode(code)) {
      const nextAttempts = challenge.attempts + 1;
      await db
        .update(passwordResetCodes)
        .set({
          attempts: sql`${passwordResetCodes.attempts} + 1`,
          ...(nextAttempts >= REPRESENTATIVE_RESET_CODE_MAX_ATTEMPTS ? { usedAt: now } : {}),
        })
        .where(eq(passwordResetCodes.id, challenge.id));

      throw new TRPCError({ code: 'BAD_REQUEST', message: INVALID_CODE_MESSAGE });
    }

    const hashedPassword = await bcrypt.hash(input.newPassword, 10);

    await db.transaction(async (tx) => {
      const consumed = await tx
        .update(passwordResetCodes)
        .set({ usedAt: now })
        .where(and(
          eq(passwordResetCodes.id, challenge.id),
          isNull(passwordResetCodes.usedAt),
          gt(passwordResetCodes.expiresAt, now),
        ))
        .returning({ id: passwordResetCodes.id });

      if (consumed.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: INVALID_CODE_MESSAGE });
      }

      const updatedAccounts = await tx
        .update(account)
        .set({ password: hashedPassword, updatedAt: now })
        .where(and(eq(account.userId, resident.userId), eq(account.providerId, 'credential')))
        .returning({ id: account.id });

      if (updatedAccounts.length === 0) {
        throw new TRPCError({
          code:    'CONFLICT',
          message: 'La cuenta no tiene acceso con contrasena local',
        });
      }

      await tx.delete(session).where(eq(session.userId, resident.userId));

      await tx.insert(auditoria).values({
        actorId:   null,
        accion:    'password_reset.codigo_usado',
        entidad:   'user',
        entidadId: resident.userId,
        detalle: {
          perfilId: resident.perfilId,
          via:      'representante',
        },
      });
    });
  }
}

export const representativePasswordResetService = new RepresentativePasswordResetService();
