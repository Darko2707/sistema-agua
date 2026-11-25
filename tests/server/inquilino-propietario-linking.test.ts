import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DrizzleResidenteRepository } from '@/src/infrastructure/db/repositories/drizzle-residente.repository';

const mocks = vi.hoisted(() => ({
  findFirstPerfil: vi.fn(),
  findFirstFracc: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
    transaction: mocks.transaction,
    query: {
      perfilesResidente: { findFirst: mocks.findFirstPerfil },
      fraccionamientos: { findFirst: mocks.findFirstFracc },
    },
  },
}));

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((v) => `enc_${v}`),
  decrypt: vi.fn((v) => v.replace(/^enc_/, '')),
}));

describe('HU-S4-08: Vinculación Dueño-Inquilino y Nomenclatura', () => {
  let repo: DrizzleResidenteRepository;
  const FRACC_ID = 'fracc-1234';

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new DrizzleResidenteRepository();
  });

  it('findPropietarioByVivienda localiza al propietario activo de la misma unidad habitacional', async () => {
    const mockPropietarioRow = {
      id: 'perfil-propietario-1',
      userId: 'user-prop-1',
      fraccionamientoId: FRACC_ID,
      edificio: '1',
      departamento: '101',
      estadoAgua: 'activo',
      telefono: '5551234567',
      sexo: 'M',
      tenencia: 'propietario',
      tipoOcupante: 'propietario',
      duenoPerfilId: null,
      nombrePropietario: null,
      telefonoPropietario: null,
      creadoEn: new Date(),
    };

    mocks.findFirstPerfil.mockResolvedValue(mockPropietarioRow);

    const propietario = await repo.findPropietarioByVivienda(FRACC_ID, '1', '101');

    expect(propietario).not.toBeNull();
    expect(propietario?.id).toBe('perfil-propietario-1');
    expect(propietario?.tipoOcupante).toBe('propietario');
    expect(propietario?.edificio).toBe('1');
    expect(propietario?.departamento).toBe('101');
  });

  it('create para inquilino almacena duenoPerfilId y tipoOcupante inquilino', async () => {
    const mockFraccionamiento = {
      id: FRACC_ID,
      slug: 'fracc-palmas',
      activo: true,
      limiteViviendas: 50,
      tipoNomenclatura: 'solo_casa',
    };

    const mockInsertedInquilino = {
      id: 'perfil-inq-1',
      userId: 'user-inq-1',
      fraccionamientoId: FRACC_ID,
      edificio: '1',
      departamento: 'Casa 42',
      estadoAgua: 'activo',
      tenencia: 'inquilino',
      tipoOcupante: 'inquilino',
      duenoPerfilId: 'perfil-propietario-1',
      nombrePropietario: 'Don Roberto Propietario',
      telefonoPropietario: '5559876543',
    };

    const tx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            for: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockFraccionamiento]),
            }),
          }),
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockInsertedInquilino]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    };

    mocks.transaction.mockImplementation(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx));

    const result = await repo.create({
      userId: 'user-inq-1',
      fraccionamientoId: FRACC_ID,
      edificio: '1',
      departamento: 'Casa 42',
      estadoAgua: 'activo',
      tenencia: 'inquilino',
      tipoOcupante: 'inquilino',
      duenoPerfilId: 'perfil-propietario-1',
      nombrePropietario: 'Don Roberto Propietario',
      telefonoPropietario: '5559876543',
    });

    expect(result.id).toBe('perfil-inq-1');
    expect(result.tipoOcupante).toBe('inquilino');
    expect(result.duenoPerfilId).toBe('perfil-propietario-1');
    expect(tx.insert).toHaveBeenCalled();
  });
});
