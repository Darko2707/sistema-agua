import { describe, expect, it } from 'vitest';
import {
  REPRESENTATIVE_RESET_CODE_TTL_MS,
  hashRepresentativeResetCode,
  isRepresentativeResetCodeValid,
  normalizeRepresentativeResetCode,
  representativeResetCodeExpiresAt,
} from '@/src/infrastructure/db/services/representative-password-reset.service';

describe('representative password reset codes', () => {
  it('normaliza codigos de 6 digitos aunque el representante los dicte con espacios', () => {
    expect(normalizeRepresentativeResetCode('123 456')).toBe('123456');
    expect(normalizeRepresentativeResetCode(' 12-34-56 ')).toBe('123456');
    expect(isRepresentativeResetCodeValid('123 456')).toBe(true);
  });

  it.each(['12345', '1234567', 'abcdef', '12 34'])('rechaza codigo invalido: %s', (code) => {
    expect(isRepresentativeResetCodeValid(code)).toBe(false);
  });

  it('calcula expiracion exacta de 10 minutos', () => {
    const now = new Date('2026-08-10T15:20:00.000Z');
    const expiresAt = representativeResetCodeExpiresAt(now);

    expect(expiresAt.getTime() - now.getTime()).toBe(REPRESENTATIVE_RESET_CODE_TTL_MS);
    expect(expiresAt.toISOString()).toBe('2026-08-10T15:30:00.000Z');
  });

  it('hashea el codigo normalizado y no expone el valor plano', () => {
    const spaced = hashRepresentativeResetCode('123 456');
    const plain = hashRepresentativeResetCode('123456');

    expect(spaced).toBe(plain);
    expect(plain).not.toContain('123456');
    expect(plain).toMatch(/^[a-f0-9]{64}$/);
  });
});
