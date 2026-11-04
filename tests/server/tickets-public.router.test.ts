import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findTicket: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    query: {
      tickets: { findFirst: mocks.findTicket },
    },
  },
}));

vi.mock('@/src/infrastructure/db/repositories', () => ({
  ticketRepo: { findByFolio: mocks.findTicket },
  residenteRepo: {},
  circuitoRepo: {},
  userRepo: {},
}));

import { ticketsRouter } from '@/server/routers/tickets';

function caller() {
  return ticketsRouter.createCaller({ user: null, headers: new Headers() });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tickets.verificar', () => {
  it('devuelve solo datos publicos de un pago de agua', async () => {
    mocks.findTicket.mockResolvedValue({
      folio: 'AGU-PUBLICO01',
      tipo: 'agua',
      emitidoEn: new Date('2026-09-01T12:00:00Z'),
      pago: {
        id: 'uuid-interno-pago',
        mes: 9,
        anio: 2026,
        monto: '100.00',
        estado: 'pagado',
        fechaPago: new Date('2026-09-01T12:00:00Z'),
        metodo: 'mercado_pago',
      },
      cargoServicio: null,
    });

    const result = await caller().verificar({ folio: 'AGU-PUBLICO01' });

    expect(result.pago).toEqual({
      mes: 9,
      anio: 2026,
      monto: '100.00',
      estado: 'pagado',
      fechaPago: new Date('2026-09-01T12:00:00Z'),
    });
    expect(result.pago).not.toHaveProperty('id');
    expect(result.pago).not.toHaveProperty('metodo');

    expect(mocks.findTicket).toHaveBeenCalledWith('AGU-PUBLICO01');
  });

  it('oculta el UUID y metodo de un cargo de servicio', async () => {
    mocks.findTicket.mockResolvedValue({
      folio: 'SRV-PUBLICO01',
      tipo: 'servicio',
      emitidoEn: new Date('2026-09-01T12:00:00Z'),
      pago: null,
      cargoServicio: {
        id: 'uuid-interno-cargo',
        mes: 9,
        anio: 2026,
        monto: '250.00',
        estado: 'pagado',
        metodo: 'mercado_pago',
        folio: 'SRV-PUBLICO01',
      },
    });

    const result = await caller().verificar({ folio: 'SRV-PUBLICO01' });

    expect(result.cargoServicio).toEqual({
      mes: 9,
      anio: 2026,
      monto: '250.00',
      estado: 'pagado',
    });
    expect(result.cargoServicio).not.toHaveProperty('id');
    expect(result.cargoServicio).not.toHaveProperty('metodo');
    expect(mocks.findTicket).toHaveBeenCalledWith('SRV-PUBLICO01');
  });
});
