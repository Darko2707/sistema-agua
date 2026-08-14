import { describe, expect, it } from 'vitest';
import {
  REPRESENTATIVE_RESET_CODE_TTL_MS,
  hashRepresentativeResetCode,
  representativeResetCodeExpiresAt,
} from '@/src/infrastructure/db/services/representative-password-reset.service';
import {
  filterRepresentativeResetCodeInput,
  isRepresentativeResetCodeValid,
} from '@/src/domain/usuarios/representative-reset-code';

describe('representative password reset codes', () => {
  it.each(['123456', '000001'])(
    'acepta exclusivamente un codigo de 6 digitos: %s',
    code => {
      expect(isRepresentativeResetCodeValid(code)).toBe(true);
    },
  );

  it('filtra la entrada visual a seis digitos sin conservar separadores', () => {
    expect(filterRepresentativeResetCodeInput('12 3-a456')).toBe('123456');
    expect(filterRepresentativeResetCodeInput('123456789')).toBe('123456');
  });

  it.each([
    '12345',
    '1234567',
    'abcdef',
    '123 456',
    ' 123456',
    '123456 ',
    '12-34-56',
    '1a2b3c4d5e6',
    '１２３４５６',
  ])('rechaza codigo invalido sin normalizarlo: %s', (code) => {
    expect(isRepresentativeResetCodeValid(code)).toBe(false);
  });

  it('calcula expiracion exacta de 10 minutos', () => {
    const now = new Date('2026-08-10T15:20:00.000Z');
    const expiresAt = representativeResetCodeExpiresAt(now);

    expect(expiresAt.getTime() - now.getTime()).toBe(REPRESENTATIVE_RESET_CODE_TTL_MS);
    expect(expiresAt.toISOString()).toBe('2026-08-10T15:30:00.000Z');
  });

  it('hashea el codigo exacto, no expone el valor plano y rechaza separadores', () => {
    const plain = hashRepresentativeResetCode('123456');

    expect(plain).not.toContain('123456');
    expect(plain).toMatch(/^[a-f0-9]{64}$/);
    expect(() => hashRepresentativeResetCode('123 456')).toThrow(TypeError);
  });
});
