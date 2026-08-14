import bcrypt from 'bcryptjs';
import {
  hashPassword as hashBetterAuthPassword,
  verifyPassword as verifyBetterAuthPassword,
} from 'better-auth/crypto';

const BCRYPT_PREFIX = /^\$2[aby]\$/;

/**
 * Single password writer for Better Auth and the administrative flows that
 * create or reset credential accounts.
 */
export function hashAccountPassword(password: string): Promise<string> {
  return hashBetterAuthPassword(password);
}

/**
 * New passwords use Better Auth's scrypt format. bcrypt is accepted only for
 * accounts written by older versions of the administrative/reset flows; the
 * next password change rewrites them as scrypt.
 */
export async function verifyAccountPassword(input: {
  hash: string;
  password: string;
}): Promise<boolean> {
  if (BCRYPT_PREFIX.test(input.hash)) {
    return bcrypt.compare(input.password, input.hash);
  }

  try {
    return await verifyBetterAuthPassword(input);
  } catch {
    // A malformed/unknown stored hash is an authentication failure, not a 500.
    return false;
  }
}
