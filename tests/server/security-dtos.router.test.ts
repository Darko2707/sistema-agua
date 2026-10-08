import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listarCircuitos: vi.fn(),
  exportarResidentes: vi.fn(),
  exportarPagos: vi.fn(),
  exportarCortes: vi.fn(),
  exportarTickets: vi.fn(),
  exportarAuditoria: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    query: {
      circuitos: { findMany: mocks.listarCircuitos },
      perfilesResidente: { findMany: mocks.exportarResidentes },
      pagos: { findMany: mocks.exportarPagos },
      cortes: { findMany: mocks.exportarCortes },
      tickets: { findMany: mocks.exportarTickets },
      auditoria: { findMany: mocks.exportarAuditoria },
    },
  },
}));

vi.mock('@/src/infrastructure/db/repositories', () => ({
  residenteRepo: {},
  circuitoRepo: {},
  userRepo: {},
}));

vi.mock('@/src/infrastructure/db/services/subscription.service', () => ({
  subscriptionService: { requireOperational: vi.fn() },
}));

vi.mock('@/src/infrastructure/db/services/drizzle-pago-reversal.service', () => ({
  reversarPagoAtomico: vi.fn(),
}));

vi.mock('@/lib/push-dispatcher', () => ({
  schedulePushDispatch: vi.fn(),
}));

import { circuitosRouter } from '@/server/routers/circuitos';
import { operacionRouter } from '@/server/routers/operacion';

const adminContext = {
  user: {
    id: 'admin-1',
    name: 'Admin',
    email: 'admin@example.com',
    image: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    role: 'admin' as const,
    fraccionamientoId: null,
  },
  headers: new Headers(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listarCircuitos.mockResolvedValue([]);
  mocks.exportarResidentes.mockResolvedValue([]);
  mocks.exportarPagos.mockResolvedValue([]);
  mocks.exportarCortes.mockResolvedValue([]);
  mocks.exportarTickets.mockResolvedValue([]);
  mocks.exportarAuditoria.mockResolvedValue([]);
});

describe('DTOs de procedimientos administrativos', () => {
  it('listarPorFraccionamiento nunca selecciona credenciales de Mercado Pago', async () => {
    await circuitosRouter.createCaller(adminContext).listarPorFraccionamiento({
      fraccionamientoId: '11111111-1111-4111-8111-111111111111',
    });

    const query = mocks.listarCircuitos.mock.calls[0]?.[0];
    expect(query.columns).toBeDefined();
    expect(query.columns).not.toHaveProperty('mercadoPagoAccessToken');
    expect(query.columns).not.toHaveProperty('mercadoPagoCollectorId');
  });

  it('exportacionCompleta usa selecciones por fraccionamiento y excluye secretos e IDs de proveedor', async () => {
    await operacionRouter.createCaller(adminContext).exportacionCompleta();

    const residentesQuery = mocks.exportarResidentes.mock.calls[0]?.[0];
    expect(residentesQuery.columns).toBeDefined();
    expect(residentesQuery.with.usuario.columns).toBeDefined();
    expect(residentesQuery.columns).not.toHaveProperty('circuitoId');
    expect(residentesQuery.with).not.toHaveProperty('circuito');

    const pagosQuery = mocks.exportarPagos.mock.calls[0]?.[0];
    expect(pagosQuery.columns).not.toHaveProperty('circuitoId');
    expect(pagosQuery.columns).not.toHaveProperty('mercadoPagoPaymentId');
    expect(pagosQuery.columns).not.toHaveProperty('mercadoPagoCollectorId');

    const ticketsQuery = mocks.exportarTickets.mock.calls[0]?.[0];
    expect(ticketsQuery.columns).not.toHaveProperty('qrCode');
    expect(ticketsQuery.columns).not.toHaveProperty('pdfUrl');

    const auditoriaQuery = mocks.exportarAuditoria.mock.calls[0]?.[0];
    expect(auditoriaQuery.columns).not.toHaveProperty('ip');
    expect(auditoriaQuery.columns).not.toHaveProperty('userAgent');
  });
});
