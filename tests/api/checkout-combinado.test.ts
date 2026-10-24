import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetSession,
  mockFindByUserIdWithPaymentConfig,
  mockFindWaterConfig,
  mockPreferenceCreate,
  mockDecryptTokenSafe,
  mockPersistPaymentIntent,
  mockCheckoutAccountLimit,
  mockRequireOperational,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFindByUserIdWithPaymentConfig: vi.fn(),
  mockFindWaterConfig: vi.fn(),
  mockPreferenceCreate: vi.fn(),
  mockDecryptTokenSafe: vi.fn(),
  mockPersistPaymentIntent: vi.fn(),
  mockCheckoutAccountLimit: vi.fn(),
  mockRequireOperational: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: mockGetSession } },
}));

vi.mock('@/src/infrastructure/db/repositories', () => ({
  residenteRepo: {
    findByUserIdWithPaymentConfig: mockFindByUserIdWithPaymentConfig,
    findWaterServiceConfig: mockFindWaterConfig,
  },
}));

const UUID_VIGILANCIA = '11111111-1111-4111-8111-111111111111';
const UUID_CHAPEO     = '22222222-2222-4222-8222-222222222222';
const UUID_FRACC      = '33333333-3333-4333-8333-333333333333';
const UUID_PERFIL     = '44444444-4444-4444-8444-444444444444';

function containsId(cond: unknown, id: string): boolean {
  if (!cond) return false;
  if (typeof cond === 'string') return cond.includes(id);
  if (typeof cond === 'object') {
    const obj = cond as { value?: unknown; queryChunks?: unknown[]; encoder?: unknown };
    if (obj.value === id) return true;
    if (Array.isArray(obj.queryChunks)) {
      return obj.queryChunks.some(c => containsId(c, id));
    }
  }
  return false;
}

// In-memory tables for tests
let inMemoryCargos: Array<{
  id: string;
  fraccionamientoId: string;
  perfilId: string;
  fraccionamientoServicioId: string;
  mes: number;
  anio: number;
  monto: string;
  estado: string;
  metodo: string | null;
  mercadoPagoPaymentId: string | null;
  folio: string | null;
  pagadoEn: Date | null;
}> = [];

let inMemoryPagos: Array<{
  id: string;
  perfilId: string;
  fraccionamientoId: string;
  mes: number;
  anio: number;
  estado: string;
}> = [];

const MOCK_FRACCIONAMIENTO = {
  id: UUID_FRACC,
  activo: true,
  montoMensual: '50.00',
  montoReconexion: '300.00',
  accessToken: 'encrypted-token',
  collectorId: 'collector-100',
};

const MOCK_SERVICIOS = [
  {
    id: UUID_VIGILANCIA,
    fraccionamientoId: UUID_FRACC,
    servicioId: 'srv-vigilancia',
    montoMensual: '150.00',
    estado: 'activo',
    activo: true,
    clave: 'vigilancia',
    nombre: 'Vigilancia',
  },
  {
    id: UUID_CHAPEO,
    fraccionamientoId: UUID_FRACC,
    servicioId: 'srv-chapeo',
    montoMensual: '80.00',
    estado: 'activo',
    activo: true,
    clave: 'chapeo',
    nombre: 'Chapeo',
  },
];

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        const tableObj = table as { _: { name: string } };
        const tableName = tableObj?._?.name ?? '';

        function makeJoinChain() {
          return {
            innerJoin: () => makeJoinChain(),
            where: (cond: unknown) => {
              const limitFn = async () => {
                const found = containsId(cond, UUID_CHAPEO) ? MOCK_SERVICIOS[1] : MOCK_SERVICIOS[0];
                return found ? [{
                  id: found.id,
                  montoMensual: found.montoMensual,
                  estado: found.estado,
                  clave: found.clave,
                  nombre: found.nombre,
                }] : [];
              };

              const matchingCargos = inMemoryCargos
                .filter(c => c.estado === 'pendiente')
                .map(c => {
                  const s = MOCK_SERVICIOS.find(srv => srv.id === c.fraccionamientoServicioId);
                  return {
                    id: c.id,
                    monto: c.monto,
                    nombre: s?.nombre ?? 'Servicio',
                  };
                });

              const promise = Promise.resolve(matchingCargos);
              (promise as unknown as { limit: typeof limitFn }).limit = limitFn;
              return promise;
            },
          };
        }

        return {
          leftJoin: () => ({
            where: () => ({
              limit: async () => [MOCK_FRACCIONAMIENTO],
            }),
          }),
          innerJoin: () => makeJoinChain(),
          where: (cond: unknown) => {
            if (tableName === 'pagos') {
              return Promise.resolve(inMemoryPagos.filter(p => p.estado === 'pagado'));
            }

            const isChapeo = containsId(cond, UUID_CHAPEO);
            const isVigilancia = containsId(cond, UUID_VIGILANCIA);

            const filtered = inMemoryCargos.filter(c => {
              if (isChapeo) return c.fraccionamientoServicioId === UUID_CHAPEO;
              if (isVigilancia) return c.fraccionamientoServicioId === UUID_VIGILANCIA;
              return true;
            });

            const prom = Promise.resolve(filtered);
            (prom as unknown as { orderBy: () => Promise<typeof filtered> }).orderBy = () => Promise.resolve(filtered);
            return prom;
          },
        };
      },
    }),
    insert: () => ({
      values: (val: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            const hex = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
            const newCargo = {
              id: `${hex}-0000-4000-8000-000000000000`,
              fraccionamientoId: String(val.fraccionamientoId),
              perfilId: String(val.perfilId),
              fraccionamientoServicioId: String(val.fraccionamientoServicioId),
              mes: Number(val.mes),
              anio: Number(val.anio),
              monto: String(val.monto),
              estado: 'pendiente',
              metodo: null,
              mercadoPagoPaymentId: null,
              folio: null,
              pagadoEn: null,
            };
            inMemoryCargos.push(newCargo);
            return [{ id: newCargo.id }];
          },
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/crypto', () => ({
  decryptTokenSafe: mockDecryptTokenSafe,
}));

vi.mock('@/lib/mercadopago', () => ({
  createMercadoPagoClients: vi.fn(() => ({
    preferenceClient: { create: mockPreferenceCreate },
    paymentClient: {},
  })),
}));

vi.mock('@/src/infrastructure/mercadopago/payment-intent', () => ({
  persistMercadoPagoPaymentIntent: mockPersistPaymentIntent,
}));

vi.mock('@/lib/ratelimit', () => ({
  checkoutAccountLimiter: { limit: mockCheckoutAccountLimit },
}));

vi.mock('@/src/infrastructure/db/services/subscription.service', () => ({
  subscriptionService: { requireOperational: mockRequireOperational },
}));

import { POST } from '@/app/api/mercadopago/checkout-combinado/route';

describe('POST /api/mercadopago/checkout-combinado - Adelanto de todos los servicios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inMemoryCargos = [];
    inMemoryPagos = [];

    mockGetSession.mockResolvedValue({
      user: { id: 'usr-1', email: 'residente@example.com', name: 'Residente Test' },
    });
    mockFindByUserIdWithPaymentConfig.mockResolvedValue({
      id: UUID_PERFIL,
      userId: 'usr-1',
      fraccionamientoId: UUID_FRACC,
      responsableCargos: true,
      estadoAgua: 'activo',
    });
    mockRequireOperational.mockResolvedValue(undefined);
    mockDecryptTokenSafe.mockReturnValue('PROD_MP_ACCESS_TOKEN');
    mockPreferenceCreate.mockResolvedValue({
      init_point: 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=mix-123',
    });
    mockCheckoutAccountLimit.mockResolvedValue({ success: true, remaining: 10, reset: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('permite adelantar meses de un servicio no-agua (ej. Vigilancia 3 meses) de forma autónoma', async () => {
    const req = new Request('https://sistema-agua.vercel.app/api/mercadopago/checkout-combinado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mesesAgua: 0,
        servicios: [{ fraccionamientoServicioId: UUID_VIGILANCIA, meses: 3 }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.url).toContain('mercadopago.com.mx');

    // 3 meses x 150 = 450 base. Con comisión MP repercutida, total > 450
    expect(Number(data.total)).toBeGreaterThan(450);

    // Se crearon 3 cargos futuros de vigilancia
    expect(inMemoryCargos.length).toBe(3);
    expect(inMemoryCargos.every(c => c.fraccionamientoServicioId === UUID_VIGILANCIA)).toBe(true);

    // Se persistió la intención de pago mixta
    expect(mockPersistPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'mixto',
        perfilId: UUID_PERFIL,
        cargosServicioIds: expect.arrayContaining([inMemoryCargos[0].id, inMemoryCargos[1].id, inMemoryCargos[2].id]),
        total: data.total,
      }),
    );
  });

  it('permite combinar agua y múltiples servicios con diferentes cantidades de meses', async () => {
    const req = new Request('https://sistema-agua.vercel.app/api/mercadopago/checkout-combinado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mesesAgua: 2, // 2 x 50 = 100
        servicios: [
          { fraccionamientoServicioId: UUID_VIGILANCIA, meses: 2 }, // 2 x 150 = 300
          { fraccionamientoServicioId: UUID_CHAPEO, meses: 1 },     // 1 x 80 = 80
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    // Base total = 100 + 300 + 80 = 480.
    // Total con comisión MP debe calcularse sobre base única de 480
    expect(Number(data.total)).toBeGreaterThan(480);

    // Mercado Pago preference con título descriptivo combinado
    expect(mockPreferenceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          items: [
            expect.objectContaining({
              unit_price: Number(data.total),
              title: expect.stringMatching(/2 periodos de agua y 3 cargos de servicios/i),
            }),
          ],
        }),
      }),
    );
  });

  it('reutiliza cargos pendientes existentes sin duplicarlos al adelantar', async () => {
    const ahora = new Date();
    const mesActual = ahora.getUTCMonth() + 1;
    const anioActual = ahora.getUTCFullYear();

    inMemoryCargos.push({
      id: '11111111-2222-4333-8444-555555555555',
      fraccionamientoId: UUID_FRACC,
      perfilId: UUID_PERFIL,
      fraccionamientoServicioId: UUID_VIGILANCIA,
      mes: mesActual,
      anio: anioActual,
      monto: '150.00',
      estado: 'pendiente',
      metodo: null,
      mercadoPagoPaymentId: null,
      folio: null,
      pagadoEn: null,
    });

    const req = new Request('https://sistema-agua.vercel.app/api/mercadopago/checkout-combinado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mesesAgua: 0,
        servicios: [{ fraccionamientoServicioId: UUID_VIGILANCIA, meses: 2 }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    // Solo se debe haber creado 1 cargo nuevo (el segundo mes), total 2
    expect(inMemoryCargos.length).toBe(2);
    expect(inMemoryCargos.some(c => c.id === '11111111-2222-4333-8444-555555555555')).toBe(true);
  });

  it('rechaza solicitudes sin conceptos seleccionados', async () => {
    const req = new Request('https://sistema-agua.vercel.app/api/mercadopago/checkout-combinado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mesesAgua: 0,
        servicios: [],
        cargoIds: [],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });
});
