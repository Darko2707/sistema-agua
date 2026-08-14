import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requestForResident: vi.fn(),
  requestIpLimit: vi.fn(),
  requestAccountLimit: vi.fn(),
}));

vi.mock('@/src/infrastructure/db/repositories', () => ({
  residenteRepo: {},
  circuitoRepo: {},
  userRepo: {},
}));

vi.mock('@/src/infrastructure/db/services/representative-password-reset.service', () => ({
  representativePasswordResetService: {
    requestForResident: mocks.requestForResident,
    listPendingForRepresentative: vi.fn(),
    generateForResident: vi.fn(),
    redeem: vi.fn(),
  },
}));

vi.mock('@/lib/ratelimit', () => ({
  representativeResetRequestIpLimiter: { limit: mocks.requestIpLimit },
  representativeResetRequestAccountLimiter: { limit: mocks.requestAccountLimit },
  representativeResetGenerateIpLimiter: null,
  representativeResetGenerateAccountLimiter: null,
  representativeResetRedeemIpLimiter: null,
  representativeResetRedeemAccountLimiter: null,
}));

import { usuariosRouter } from '@/server/routers/usuarios';

function caller() {
  return usuariosRouter.createCaller({
    user: null,
    headers: new Headers({ 'x-vercel-forwarded-for': '203.0.113.10' }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requestForResident.mockResolvedValue(undefined);
  mocks.requestIpLimit.mockResolvedValue({ success: true });
  mocks.requestAccountLimit.mockResolvedValue({ success: true });
});

describe('usuarios.solicitarCodigoRecuperacion', () => {
  it('responde genericamente aunque el correo no corresponda a una cuenta', async () => {
    await expect(caller().solicitarCodigoRecuperacion({
      email: ' No-Existe@Example.com ',
    })).resolves.toEqual({ ok: true });

    expect(mocks.requestForResident).toHaveBeenCalledWith({ email: 'no-existe@example.com' });
  });

  it('aplica limites independientes y opacos por IP y por cuenta', async () => {
    await caller().solicitarCodigoRecuperacion({ email: 'residente@example.com' });

    expect(mocks.requestIpLimit).toHaveBeenCalledWith(expect.stringMatching(/^ip:[a-f0-9]{64}$/));
    expect(mocks.requestAccountLimit).toHaveBeenCalledWith(expect.stringMatching(/^account:[a-f0-9]{64}$/));
  });

  it('rechaza el input invalido antes de consultar el servicio', async () => {
    await expect(caller().solicitarCodigoRecuperacion({ email: 'correo-invalido' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(mocks.requestForResident).not.toHaveBeenCalled();
  });
});
