import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { hashAccountPassword, verifyAccountPassword } from '@/lib/password';

describe('password compatibility', () => {
  it('writes and verifies the Better Auth scrypt format', async () => {
    const hash = await hashAccountPassword('una-clave-segura-123');

    expect(hash).not.toMatch(/^\$2[aby]\$/);
    await expect(verifyAccountPassword({ hash, password: 'una-clave-segura-123' })).resolves.toBe(true);
    await expect(verifyAccountPassword({ hash, password: 'incorrecta' })).resolves.toBe(false);
  });

  it('keeps existing bcrypt accounts usable until their next password change', async () => {
    const hash = await bcrypt.hash('clave-legada-123', 4);

    await expect(verifyAccountPassword({ hash, password: 'clave-legada-123' })).resolves.toBe(true);
    await expect(verifyAccountPassword({ hash, password: 'incorrecta' })).resolves.toBe(false);
  });

  it('treats an unknown stored format as invalid credentials', async () => {
    await expect(verifyAccountPassword({
      hash: 'not-a-supported-hash',
      password: 'cualquier-clave',
    })).resolves.toBe(false);
  });
});
