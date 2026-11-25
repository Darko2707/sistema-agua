import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { CrearPerfilHandler } from '@/src/application/residentes/commands/crear-perfil.handler';
import { LimiteViviendasAlcanzadoError } from '@/src/domain/residente/limite-viviendas.error';
import type { ResidenteRepository } from '@/src/application/ports/residente.repository';

describe('HU-S4-02: Licenciamiento dinámico y límite de viviendas', () => {
  const repoMock: ResidenteRepository = {
    findById: vi.fn(),
    findByUserId: vi.fn().mockResolvedValue(null),
    findAll: vi.fn(),
    findAllPaginated: vi.fn(),
    findByEstado: vi.fn(),
    findByTenantPaginated: vi.fn(),
    create: vi.fn(),
    updateEstado: vi.fn(),
    marcarMorososDelMes: vi.fn(),
  };

  const handler = new CrearPerfilHandler({ residenteRepo: repoMock });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('LimiteViviendasAlcanzadoError tiene el mensaje y nombre correctos', () => {
    const error = new LimiteViviendasAlcanzadoError(50);
    expect(error.name).toBe('LimiteViviendasAlcanzadoError');
    expect(error.limite).toBe(50);
    expect(error.message).toContain('50');
    expect(error.message).toContain('límite máximo de viviendas contratadas');
  });

  it('rechaza el alta con PRECONDITION_FAILED cuando se alcanza el límite de viviendas contratadas', async () => {
    vi.mocked(repoMock.create).mockRejectedValueOnce(new LimiteViviendasAlcanzadoError(50));

    await expect(
      handler.execute({
        userId: 'user-excedido',
        telefono: '2281234567',
        sexo: 'femenino',
        tenencia: 'propietario',
        fraccionamientoId: '00000000-0000-4000-8000-000000000001',
        diaCorte: 5,
        edificio: '1',
        departamento: '101',
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(TRPCError);
      const trpcError = error as TRPCError;
      expect(trpcError.code).toBe('PRECONDITION_FAILED');
      expect(trpcError.message).toContain('50');
      return true;
    });
  });
});
