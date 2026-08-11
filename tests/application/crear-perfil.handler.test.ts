import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  CrearPerfilHandler,
  type CrearPerfilCommand,
} from '@/src/application/residentes/commands/crear-perfil.handler';
import type {
  ResidenteData,
  ResidenteRepository,
} from '@/src/application/ports/residente.repository';
import type {
  CircuitoData,
  CircuitoRepository,
} from '@/src/application/ports/circuito.repository';

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const fechaNegocioMock = vi.hoisted(() => ({
  value: { dia: 1, mes: 8, anio: 2026 },
}));

vi.mock('@/lib/logger', () => ({ logger: loggerMocks }));
vi.mock('@/src/domain/shared/fecha-negocio', () => ({
  fechaNegocio: vi.fn(() => fechaNegocioMock.value),
}));

const UNIQUE_VIVIENDA = 'uq_perfiles_residente_ubicacion';

const circuitoActivo: CircuitoData = {
  id: '00000000-0000-4000-8000-000000000001',
  nombre: 'Circuito Uno',
  representanteId: null,
  tesoreraId: null,
  montoMensual: '100.00',
  montoReconexion: '300.00',
  mercadoPagoAccessToken: null,
  mercadoPagoCollectorId: null,
  activo: true,
};

const perfilCreado: ResidenteData = {
  id: '10000000-0000-4000-8000-000000000001',
  userId: 'user-new',
  circuitoId: circuitoActivo.id,
  edificio: '8',
  departamento: '314A',
  estadoAgua: 'activo',
  telefono: '2281234567',
  sexo: 'femenino',
  tenencia: 'propietario',
  nombrePropietario: null,
  telefonoPropietario: null,
  creadoEn: new Date('2026-08-09T00:00:00.000Z'),
};

const command: CrearPerfilCommand = {
  userId: 'user-new',
  telefono: '2281234567',
  sexo: 'femenino',
  tenencia: 'propietario',
  circuitoId: circuitoActivo.id,
  edificio: '  08  ',
  departamento: '  0314a  ',
};

function makeResidenteRepo(): ResidenteRepository {
  return {
    findById: vi.fn(),
    findByUserId: vi.fn().mockResolvedValue(null),
    findByCircuito: vi.fn(),
    findAll: vi.fn(),
    findAllPaginated: vi.fn(),
    findByCircuitoPaginated: vi.fn(),
    findByEstado: vi.fn(),
    findByCircuitoYEstado: vi.fn(),
    create: vi.fn().mockResolvedValue(perfilCreado),
    updateEstado: vi.fn(),
    marcarMorososDelMes: vi.fn(),
  };
}

function makeCircuitoRepo(): CircuitoRepository {
  return {
    findById: vi.fn().mockResolvedValue(circuitoActivo),
    findByRepresentante: vi.fn(),
    findByTesorera: vi.fn(),
    findAll: vi.fn(),
    findActivos: vi.fn(),
    updateActivo: vi.fn(),
    updateMontos: vi.fn(),
    updateRepresentante: vi.fn(),
    updateTesorera: vi.fn(),
    updateRepresentanteWithMp: vi.fn(),
    updateTesoreraWithMp: vi.fn(),
    clearRepresentanteByUserId: vi.fn(),
    clearTesoreraByUserId: vi.fn(),
  };
}

function makeHandler() {
  const residenteRepo = makeResidenteRepo();
  const circuitoRepo = makeCircuitoRepo();
  return {
    residenteRepo,
    circuitoRepo,
    handler: new CrearPerfilHandler({ residenteRepo, circuitoRepo }),
  };
}

function pgUniqueError(constraint: string, privateDetail = '') {
  return Object.assign(
    new Error(`duplicate key value violates unique constraint "${constraint}" ${privateDetail}`),
    { code: '23505', constraint },
  );
}

async function capturarError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error('Se esperaba que la promesa fallara');
  } catch (error) {
    return error;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  fechaNegocioMock.value = { dia: 1, mes: 8, anio: 2026 };
});

describe('CrearPerfilHandler', () => {
  it('canonicaliza la vivienda, crea el perfil y registra el log solo despues del exito', async () => {
    const { handler, residenteRepo } = makeHandler();

    const result = await handler.execute(command);

    expect(result).toBe(perfilCreado);
    expect(residenteRepo.create).toHaveBeenCalledWith({
      userId: 'user-new',
      circuitoId: circuitoActivo.id,
      edificio: '8',
      departamento: '314A',
      estadoAgua: 'activo',
      telefono: '2281234567',
      sexo: 'femenino',
      tenencia: 'propietario',
      nombrePropietario: null,
      telefonoPropietario: null,
    });
    expect(loggerMocks.info).toHaveBeenCalledOnce();
    expect(loggerMocks.info).toHaveBeenCalledWith('usuario.perfil.creado', {
      userId: 'user-new',
      estadoInicial: 'activo',
    });
  });

  it('crea como pendiente de corte si el alta ocurre despues del dia de corte', async () => {
    fechaNegocioMock.value = { dia: 11, mes: 8, anio: 2026 };
    const { handler, residenteRepo } = makeHandler();

    await handler.execute(command);

    expect(residenteRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      estadoAgua: 'pendiente_corte',
    }));
    expect(loggerMocks.info).toHaveBeenCalledWith('usuario.perfil.creado', {
      userId: 'user-new',
      estadoInicial: 'pendiente_corte',
    });
  });

  it('rechaza un circuito inactivo sin consultar ni crear un perfil', async () => {
    const { handler, circuitoRepo, residenteRepo } = makeHandler();
    vi.mocked(circuitoRepo.findById).mockResolvedValue({
      ...circuitoActivo,
      activo: false,
    });

    await expect(handler.execute(command)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(residenteRepo.findByUserId).not.toHaveBeenCalled();
    expect(residenteRepo.create).not.toHaveBeenCalled();
    expect(loggerMocks.info).not.toHaveBeenCalled();
  });

  it('rechaza al usuario que ya tiene perfil sin intentar otro insert', async () => {
    const { handler, residenteRepo } = makeHandler();
    vi.mocked(residenteRepo.findByUserId).mockResolvedValue(perfilCreado);

    const error = await capturarError(handler.execute(command));

    expect(error).toBeInstanceOf(TRPCError);
    expect(error).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Ya tienes un perfil registrado',
    });
    expect(residenteRepo.create).not.toHaveBeenCalled();
    expect(loggerMocks.info).not.toHaveBeenCalled();
  });

  it('convierte la violacion directa de la vivienda unica en un CONFLICT amistoso sin filtrar datos', async () => {
    const { handler, residenteRepo } = makeHandler();
    const privateDetail = 'victima@example.com telefono=2289999999 edificio=8 departamento=314A';
    vi.mocked(residenteRepo.create).mockRejectedValue(
      pgUniqueError(UNIQUE_VIVIENDA, privateDetail),
    );

    const error = await capturarError(handler.execute(command));

    expect(error).toBeInstanceOf(TRPCError);
    expect(error).toMatchObject({ code: 'CONFLICT' });
    const message = (error as Error).message;
    expect(message).toContain('ya tienen una cuenta registrada');
    expect(message).not.toContain('victima@example.com');
    expect(message).not.toContain('2289999999');
    expect(message).not.toContain('314A');
    expect(loggerMocks.info).not.toHaveBeenCalled();
  });

  it('reconoce la violacion de vivienda anidada en cause', async () => {
    const { handler, residenteRepo } = makeHandler();
    const databaseError = pgUniqueError(UNIQUE_VIVIENDA, 'dato-sensible');
    const wrappedError = Object.assign(new Error('Drizzle query failed'), {
      cause: databaseError,
    });
    vi.mocked(residenteRepo.create).mockRejectedValue(wrappedError);

    const error = await capturarError(handler.execute(command));

    expect(error).toBeInstanceOf(TRPCError);
    expect(error).toMatchObject({ code: 'CONFLICT' });
    expect((error as Error).message).not.toContain('dato-sensible');
    expect(loggerMocks.info).not.toHaveBeenCalled();
  });

  it('propaga una violacion 23505 de otra restriccion', async () => {
    const { handler, residenteRepo } = makeHandler();
    const databaseError = pgUniqueError('perfiles_residente_user_id_unique');
    vi.mocked(residenteRepo.create).mockRejectedValue(databaseError);

    await expect(handler.execute(command)).rejects.toBe(databaseError);
    expect(loggerMocks.info).not.toHaveBeenCalled();
  });

  it('propaga sin alterar un error desconocido de base de datos', async () => {
    const { handler, residenteRepo } = makeHandler();
    const databaseError = new Error('database unavailable');
    vi.mocked(residenteRepo.create).mockRejectedValue(databaseError);

    await expect(handler.execute(command)).rejects.toBe(databaseError);
    expect(loggerMocks.info).not.toHaveBeenCalled();
  });
});
