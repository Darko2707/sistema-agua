import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requestForResident: vi.fn(),
  requestIpLimit: vi.fn(),
  requestAccountLimit: vi.fn(),
  findByRepresentante: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    select: mocks.select,
  },
}));

vi.mock('@/src/infrastructure/db/repositories', () => ({
  residenteRepo: {},
  circuitoRepo: { findByRepresentante: mocks.findByRepresentante },
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

function authenticatedCaller(role: 'admin' | 'representante') {
  return usuariosRouter.createCaller({
    user: {
      id: `${role}-1`,
      name: role,
      email: `${role}@example.com`,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      role,
      fraccionamientoId: role === 'admin' ? null : '11111111-1111-4111-8111-111111111111',
    },
    headers: new Headers({ 'x-vercel-forwarded-for': '203.0.113.10' }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requestForResident.mockResolvedValue(undefined);
  mocks.requestIpLimit.mockResolvedValue({ success: true });
  mocks.requestAccountLimit.mockResolvedValue({ success: true });
  mocks.findByRepresentante.mockResolvedValue({
    id: '22222222-2222-4222-8222-222222222222',
    activo: true,
  });
  mocks.select.mockReturnValue({
    from: () => ({
      where: () => ({ limit: async () => [{ activo: true }] }),
    }),
  });
});

describe('usuarios roles asignables', () => {
  it('rechaza promover una cuenta al rol operador_pozo', async () => {
    await expect(authenticatedCaller('admin').cambiarRol({
      userId: 'usuario-1',
      rol: 'operador_pozo' as never,
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rechaza que un representante asigne el rol operador_pozo', async () => {
    await expect(authenticatedCaller('representante').cambiarRolEnCircuito({
      userId: 'usuario-1',
      rol: 'operador_pozo' as never,
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rechaza crear una asignacion operativa con un rol desconocido', async () => {
    await expect(authenticatedCaller('admin').asignarPersonalOperativo({
      usuarioId: 'usuario-1',
      fraccionamientoId: '11111111-1111-4111-8111-111111111111',
      fraccionamientoServicioId: '33333333-3333-4333-8333-333333333333',
      rol: 'rol_desconocido' as never,
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
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
