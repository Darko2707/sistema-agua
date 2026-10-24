import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRedirect, mockRequireSession, mockFindByUserId } = vi.hoisted(() => ({
  mockRedirect: vi.fn((path: string) => {
    const error = new Error(`NEXT_REDIRECT: ${path}`);
    (error as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${path};307;;`;
    throw error;
  }),
  mockRequireSession: vi.fn(),
  mockFindByUserId: vi.fn(),
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

vi.mock('@/components/push/PushNotificationManager', () => ({
  PushNotificationManager: () => null,
}));

import ResidenteLayout from '@/app/(residente)/residente/layout';

describe('ResidenteLayout - Protección de navegación y rutas de trabajadores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirige a /admin a usuarios con rol admin que no tienen perfil de residente', async () => {
    mockRequireSession.mockResolvedValueOnce({
      user: { id: 'admin-1', role: 'admin', fraccionamientoId: null },
    });
    mockFindByUserId.mockResolvedValueOnce(null);

    await expect(ResidenteLayout({ children: 'Contenido' })).rejects.toThrow('NEXT_REDIRECT: /admin');
    expect(mockRedirect).toHaveBeenCalledWith('/admin');
  });

  it('redirige a /tesorera a personal de tesorería que no tiene perfil de residente', async () => {
    mockRequireSession.mockResolvedValueOnce({
      user: { id: 'tesorera-1', role: 'tesorera', fraccionamientoId: 'fracc-1' },
    });
    mockFindByUserId.mockResolvedValueOnce(null);

    await expect(ResidenteLayout({ children: 'Contenido' })).rejects.toThrow('NEXT_REDIRECT: /tesorera');
    expect(mockRedirect).toHaveBeenCalledWith('/tesorera');
  });

  it('redirige a /representante a representantes que no tienen perfil de residente', async () => {
    mockRequireSession.mockResolvedValueOnce({
      user: { id: 'rep-1', role: 'representante', fraccionamientoId: 'fracc-1' },
    });
    mockFindByUserId.mockResolvedValueOnce(null);

    await expect(ResidenteLayout({ children: 'Contenido' })).rejects.toThrow('NEXT_REDIRECT: /representante');
    expect(mockRedirect).toHaveBeenCalledWith('/representante');
  });

  it('redirige a /trabajador a personal operativo (cuadrilla) que no tiene perfil de residente', async () => {
    mockRequireSession.mockResolvedValueOnce({
      user: { id: 'cuadrilla-1', role: 'cuadrilla_cortes', fraccionamientoId: 'fracc-1' },
    });
    mockFindByUserId.mockResolvedValueOnce(null);

    await expect(ResidenteLayout({ children: 'Contenido' })).rejects.toThrow('NEXT_REDIRECT: /trabajador');
    expect(mockRedirect).toHaveBeenCalledWith('/trabajador');
  });

  it('redirige a /registro a residentes que aún no completan su registro de vivienda', async () => {
    mockRequireSession.mockResolvedValueOnce({
      user: { id: 'res-nuevo', role: 'residente', fraccionamientoId: 'fracc-1' },
    });
    mockFindByUserId.mockResolvedValueOnce(null);

    await expect(ResidenteLayout({ children: 'Contenido' })).rejects.toThrow('NEXT_REDIRECT: /registro');
    expect(mockRedirect).toHaveBeenCalledWith('/registro');
  });

  it('permite el acceso y renderiza los componentes a residentes con perfil activo', async () => {
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

