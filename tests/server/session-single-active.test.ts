import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  findFraccionamiento: vi.fn(),
  findPriorSessions: vi.fn(),
  deleteSessions: vi.fn(),
  insertAuditoria: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    query: {
      user: { findFirst: mocks.findUser },
      fraccionamientos: { findFirst: mocks.findFraccionamiento },
      session: { findMany: mocks.findPriorSessions },
    },
    delete: vi.fn(() => ({
      where: mocks.deleteSessions,
    })),
    insert: vi.fn(() => ({
      values: mocks.insertAuditoria,
    })),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: mocks.loggerWarn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';

describe('HU-S4-01: Control de sesión única y anti-piratería', () => {
  const sessionBeforeHook = auth.options.databaseHooks?.session?.create?.before;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUser.mockResolvedValue({
      id: 'usr-123',
      role: 'residente',
      fraccionamientoId: 'fracc-1',
      deletedAt: null,
    });
    mocks.findFraccionamiento.mockResolvedValue({ activo: true });
    mocks.deleteSessions.mockResolvedValue(undefined);
    mocks.insertAuditoria.mockResolvedValue(undefined);
  });

  it('el hook session.create.before está configurado en Better Auth', () => {
    expect(sessionBeforeHook).toBeDefined();
    expect(typeof sessionBeforeHook).toBe('function');
  });

  it('revoca sesiones previas al iniciar una nueva sesión', async () => {
    mocks.findPriorSessions.mockResolvedValue([
      {
        id: 'sess-old-1',
        userId: 'usr-123',
        ipAddress: '192.168.1.10',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        createdAt: new Date(Date.now() - 3600 * 1000), // 1 hora atrás
      },
    ]);

    const newSession = {
      id: 'sess-new-2',
      userId: 'usr-123',
      token: 'tok-new',
      ipAddress: '192.168.1.10',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
      expiresAt: new Date(Date.now() + 86400 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await sessionBeforeHook!(newSession);

    // Debe haber eliminado las sesiones previas
    expect(mocks.deleteSessions).toHaveBeenCalledOnce();

    // Debe haber registrado auditoría de inicio de sesión
    expect(mocks.insertAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'usr-123',
        accion: 'auth.sesion_iniciada',
        entidad: 'session',
        entidadId: 'sess-new-2',
        detalle: expect.objectContaining({
          sesionesPreviasInvalidadas: 1,
        }),
      }),
    );

    // No debe alertar si la IP es la misma
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('detecta inicios concurrentes desde IPs distintas en intervalos cortos (<15 min) y registra alerta', async () => {
    const diezMinutosAtras = new Date(Date.now() - 10 * 60 * 1000);
    mocks.findPriorSessions.mockResolvedValue([
      {
        id: 'sess-old-ip1',
        userId: 'usr-123',
        ipAddress: '189.200.10.5',
        userAgent: 'Chrome en CDMX',
        createdAt: diezMinutosAtras,
      },
    ]);

    const newSession = {
      id: 'sess-new-ip2',
      userId: 'usr-123',
      token: 'tok-new',
      ipAddress: '201.150.30.8', // IP distinta
      userAgent: 'Safari en Monterrey',
      expiresAt: new Date(Date.now() + 86400 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await sessionBeforeHook!(newSession);

    // Debe emitir logger.warn y registrar seguridad.alerta_sesion_concurrente
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'seguridad.alerta_sesion_concurrente',
      expect.objectContaining({
        userId: 'usr-123',
        ipAnterior: '189.200.10.5',
        ipNueva: '201.150.30.8',
      }),
    );

    expect(mocks.insertAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'usr-123',
        accion: 'seguridad.alerta_sesion_concurrente',
        entidad: 'session',
        entidadId: 'sess-old-ip1',
        detalle: expect.objectContaining({
          ipAnterior: '189.200.10.5',
          ipNueva: '201.150.30.8',
        }),
      }),
    );

    // Aún así debe invalidar la sesión previa
    expect(mocks.deleteSessions).toHaveBeenCalledOnce();
  });

  it('rechaza la sesión si el usuario no existe o está desactivado', async () => {
    mocks.findUser.mockResolvedValue(null);

    const newSession = {
      id: 'sess-fail',
      userId: 'usr-invalido',
      token: 'tok-fail',
      expiresAt: new Date(Date.now() + 86400 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(sessionBeforeHook!(newSession)).rejects.toThrow('Cuenta no disponible');
  });
});
