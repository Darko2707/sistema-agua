import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRedirect, mockRequireSession, mockFindByUserId, mockDbSelect } = vi.hoisted(() => ({
  mockRedirect: vi.fn((path: string) => {
    const error = new Error(`NEXT_REDIRECT: ${path}`);
    (error as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${path};307;;`;
    throw error;
  }),
  mockRequireSession: vi.fn(),
  mockFindByUserId: vi.fn(),
  mockDbSelect: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('@/lib/session', () => ({
  requireSession: mockRequireSession,
}));

vi.mock('@/src/infrastructure/db/repositories', () => ({
  residenteRepo: {
    findByUserId: mockFindByUserId,
  },
}));

vi.mock('@/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/components/push/PushNotificationManager', () => ({
  PushNotificationManager: () => null,
}));

import ResidenteLayout from '@/app/(residente)/residente/layout';
import TrabajadorLayout from '@/app/(trabajador)/trabajador/layout';

describe('Guards de navegación y aislamiento de roles en SISCo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ResidenteLayout (Acceso a /residente)', () => {
    it('redirige a /login a usuarios no autenticados', async () => {
      mockRequireSession.mockImplementationOnce(() => {
        mockRedirect('/login');
      });

      await expect(ResidenteLayout({ children: 'Contenido' })).rejects.toThrow('NEXT_REDIRECT: /login');
      expect(mockRedirect).toHaveBeenCalledWith('/login');
    });

    it('redirige a /admin a usuarios con rol admin que no tienen perfil de residente', async () => {
      mockRequireSession.mockResolvedValueOnce({
        user: { id: 'admin-1', role: 'admin', fraccionamientoId: null },
      });
      mockFindByUserId.mockResolvedValueOnce(null);

      await expect(ResidenteLayout({ children: 'Contenido' })).rejects.toThrow('NEXT_REDIRECT: /admin');
      expect(mockRedirect).toHaveBeenCalledWith('/admin');
    });

    it('permite acceso a /residente a usuarios admin que sí tienen perfil de residente', async () => {
      mockRequireSession.mockResolvedValueOnce({
        user: { id: 'admin-1', role: 'admin', fraccionamientoId: 'fracc-1' },
      });
      mockFindByUserId.mockResolvedValueOnce({
        id: 'perfil-admin',
        userId: 'admin-1',
        fraccionamientoId: 'fracc-1',
        edificio: 'A',
        departamento: '100',
      });

      const jsx = await ResidenteLayout({ children: 'Contenido Admin-Residente' });
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(jsx).toBeDefined();
    });

    it('redirige a /tesorera a personal de tesorería que no tiene perfil de residente', async () => {
      mockRequireSession.mockResolvedValueOnce({
        user: { id: 'tesorera-1', role: 'tesorera', fraccionamientoId: 'fracc-1' },
      });
      mockFindByUserId.mockResolvedValueOnce(null);

      await expect(ResidenteLayout({ children: 'Contenido' })).rejects.toThrow('NEXT_REDIRECT: /tesorera');
      expect(mockRedirect).toHaveBeenCalledWith('/tesorera');
    });

    it('permite acceso a /residente a personal de tesorería que sí tiene perfil de residente', async () => {
      mockRequireSession.mockResolvedValueOnce({
        user: { id: 'tesorera-1', role: 'tesorera', fraccionamientoId: 'fracc-1' },
      });
      mockFindByUserId.mockResolvedValueOnce({
        id: 'perfil-tesorera',
        userId: 'tesorera-1',
        fraccionamientoId: 'fracc-1',
        edificio: 'B',
        departamento: '201',
      });

      const jsx = await ResidenteLayout({ children: 'Contenido Tesorera-Residente' });
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(jsx).toBeDefined();
    });

    it('redirige a /representante a representantes que no tienen perfil de residente', async () => {
      mockRequireSession.mockResolvedValueOnce({
        user: { id: 'rep-1', role: 'representante', fraccionamientoId: 'fracc-1' },
      });
      mockFindByUserId.mockResolvedValueOnce(null);

      await expect(ResidenteLayout({ children: 'Contenido' })).rejects.toThrow('NEXT_REDIRECT: /representante');
      expect(mockRedirect).toHaveBeenCalledWith('/representante');
    });

    it('permite acceso a /residente a representantes que sí tienen perfil de residente', async () => {
      mockRequireSession.mockResolvedValueOnce({
        user: { id: 'rep-1', role: 'representante', fraccionamientoId: 'fracc-1' },
      });
      mockFindByUserId.mockResolvedValueOnce({
        id: 'perfil-rep',
        userId: 'rep-1',
        fraccionamientoId: 'fracc-1',
        edificio: 'C',
        departamento: '301',
      });

      const jsx = await ResidenteLayout({ children: 'Contenido Rep-Residente' });
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(jsx).toBeDefined();
    });

    it('redirige a /trabajador a personal operativo (cuadrilla) que no tiene perfil de residente', async () => {
      mockRequireSession.mockResolvedValueOnce({
        user: { id: 'cuadrilla-1', role: 'cuadrilla_cortes', fraccionamientoId: 'fracc-1' },
      });
      mockFindByUserId.mockResolvedValueOnce(null);

      await expect(ResidenteLayout({ children: 'Contenido' })).rejects.toThrow('NEXT_REDIRECT: /trabajador');
      expect(mockRedirect).toHaveBeenCalledWith('/trabajador');
    });

    it('permite acceso a /residente a personal operativo (cuadrilla) que sí tiene perfil de residente', async () => {
      mockRequireSession.mockResolvedValueOnce({
        user: { id: 'cuadrilla-1', role: 'cuadrilla_cortes', fraccionamientoId: 'fracc-1' },
      });
      mockFindByUserId.mockResolvedValueOnce({
        id: 'perfil-cuadrilla',
        userId: 'cuadrilla-1',
        fraccionamientoId: 'fracc-1',
        edificio: 'D',
        departamento: '102',
      });

      const jsx = await ResidenteLayout({ children: 'Contenido Cuadrilla-Residente' });
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(jsx).toBeDefined();
    });

    it('redirige a /registro a residentes que aún no completan su registro de vivienda', async () => {
      mockRequireSession.mockResolvedValueOnce({
        user: { id: 'res-nuevo', role: 'residente', fraccionamientoId: 'fracc-1' },
      });
      mockFindByUserId.mockResolvedValueOnce(null);

      await expect(ResidenteLayout({ children: 'Contenido' })).rejects.toThrow('NEXT_REDIRECT: /registro');
      expect(mockRedirect).toHaveBeenCalledWith('/registro');
    });

    it('permite el acceso a residentes regulares con perfil activo', async () => {
      mockRequireSession.mockResolvedValueOnce({
        user: { id: 'res-1', role: 'residente', fraccionamientoId: 'fracc-1' },
      });
      mockFindByUserId.mockResolvedValueOnce({
        id: 'perfil-1',
        userId: 'res-1',
        fraccionamientoId: 'fracc-1',
        edificio: 'A',
        departamento: '101',
      });

      const jsx = await ResidenteLayout({ children: 'Panel Residente' });
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(jsx).toBeDefined();
    });
  });

  describe('TrabajadorLayout (Acceso a /trabajador)', () => {
    it('redirige a /login a usuarios no autenticados', async () => {
      mockRequireSession.mockImplementationOnce(() => {
        mockRedirect('/login');
      });

      await expect(TrabajadorLayout({ children: 'Panel Cuadrilla' })).rejects.toThrow('NEXT_REDIRECT: /login');
      expect(mockRedirect).toHaveBeenCalledWith('/login');
    });

    it('permite el acceso a trabajador con rol cuadrilla_cortes sin perfil de residente', async () => {
      mockRequireSession.mockResolvedValueOnce({
        user: { id: 'cuadrilla-1', role: 'cuadrilla_cortes', fraccionamientoId: 'fracc-1' },
      });

      const jsx = await TrabajadorLayout({ children: 'Panel Cuadrilla' });
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(jsx).toBeDefined();
    });

    it('permite el acceso a trabajador con rol cuadrilla_cortes que también tiene perfil de residente', async () => {
      mockRequireSession.mockResolvedValueOnce({
        user: { id: 'cuadrilla-dual', role: 'cuadrilla_cortes', fraccionamientoId: 'fracc-1' },
      });

      const jsx = await TrabajadorLayout({ children: 'Panel Cuadrilla Dual' });
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(jsx).toBeDefined();
    });

    it('permite el acceso a usuarios con rol admin', async () => {
      mockRequireSession.mockResolvedValueOnce({
        user: { id: 'admin-1', role: 'admin', fraccionamientoId: null },
      });

      const jsx = await TrabajadorLayout({ children: 'Panel Admin en Cuadrilla' });
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(jsx).toBeDefined();
    });

    it('permite el acceso a usuario con rol residente que cuenta con asignación operativa activa de cuadrilla', async () => {
      mockRequireSession.mockResolvedValueOnce({
        user: { id: 'res-operativo', role: 'residente', fraccionamientoId: 'fracc-1' },
      });

      mockDbSelect.mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: async () => [{ id: 'asig-1' }],
          }),
        }),
      });

      const jsx = await TrabajadorLayout({ children: 'Panel Cuadrilla Residente Asignado' });
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(jsx).toBeDefined();
    });

    it('redirige a /residente a un residente regular sin asignación operativa', async () => {
      mockRequireSession.mockResolvedValueOnce({
        user: { id: 'res-comun', role: 'residente', fraccionamientoId: 'fracc-1' },
      });

      mockDbSelect.mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      });

      await expect(TrabajadorLayout({ children: 'Panel Cuadrilla' })).rejects.toThrow('NEXT_REDIRECT: /residente');
      expect(mockRedirect).toHaveBeenCalledWith('/residente');
    });

    it('redirige a /tesorera a personal de tesorería sin asignación operativa', async () => {
      mockRequireSession.mockResolvedValueOnce({
        user: { id: 'tesorera-1', role: 'tesorera', fraccionamientoId: 'fracc-1' },
      });

      mockDbSelect.mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      });

      await expect(TrabajadorLayout({ children: 'Panel Cuadrilla' })).rejects.toThrow('NEXT_REDIRECT: /tesorera');
      expect(mockRedirect).toHaveBeenCalledWith('/tesorera');
    });

    it('redirige a /representante a un representante sin asignación operativa', async () => {
      mockRequireSession.mockResolvedValueOnce({
        user: { id: 'rep-1', role: 'representante', fraccionamientoId: 'fracc-1' },
      });

      mockDbSelect.mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      });

      await expect(TrabajadorLayout({ children: 'Panel Cuadrilla' })).rejects.toThrow('NEXT_REDIRECT: /representante');
      expect(mockRedirect).toHaveBeenCalledWith('/representante');
    });
  });
});
