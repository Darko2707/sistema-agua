import { createHash, createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REPRESENTATIVE_RESET_CODE_TTL_MS,
  hashRepresentativeResetCode,
  representativeResetCodeExpiresAt,
} from '@/src/infrastructure/db/services/representative-password-reset.service';
import {
  filterRepresentativeResetCodeInput,
  isRepresentativeResetCodeValid,
} from '@/src/domain/usuarios/representative-reset-code';

const RESET_CODE_SECRET_ENV = 'REPRESENTATIVE_RESET_CODE_SECRET';

afterEach(() => {
  vi.unstubAllEnvs();
});

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

  it('protege el codigo con HMAC y un secreto separado', () => {
    const secret = 'a-secure-reset-code-secret-with-32-bytes';
    vi.stubEnv(RESET_CODE_SECRET_ENV, secret);
    const digest = hashRepresentativeResetCode('123456');

    expect(digest).toBe(createHmac('sha256', secret)
      .update('representative-password-reset\0' + '123456')
      .digest('hex'));
    expect(digest).not.toBe(createHash('sha256').update('123456').digest('hex'));
    expect(digest).not.toContain('123456');
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(() => hashRepresentativeResetCode('123 456')).toThrow(TypeError);
  });

  it('falla cerrado en produccion si falta el secreto o es demasiado corto', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv(RESET_CODE_SECRET_ENV, '');
    expect(() => hashRepresentativeResetCode('123456'))
      .toThrow('REPRESENTATIVE_RESET_CODE_SECRET no esta configurado');

    vi.stubEnv(RESET_CODE_SECRET_ENV, 'demasiado-corto');
    expect(() => hashRepresentativeResetCode('123456'))
      .toThrow('REPRESENTATIVE_RESET_CODE_SECRET debe contener al menos 32 bytes');
  });

  it('usa un secreto fijo solamente en pruebas aisladas', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv(RESET_CODE_SECRET_ENV, '');

    expect(hashRepresentativeResetCode('123456'))
      .toBe(hashRepresentativeResetCode('123456'));
  });
});
