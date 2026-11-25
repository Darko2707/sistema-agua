import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  process.env.VERCEL = '1';
  return {
    getSession: vi.fn(),
    canRead: vi.fn(),
    blobGet: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/lib/private-upload-access', () => ({ canReadPrivateUpload: mocks.canRead }));
vi.mock('@vercel/blob', () => ({ get: mocks.blobGet, put: vi.fn() }));

import { GET as getUpload } from '@/app/api/upload/route';
import { GET as getLegacyUpload } from '@/app/uploads/[...path]/route';

const reference = 'uploads/resident-a/11111111-1111-4111-8111-111111111111.jpg';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: 'resident-b' } });
  mocks.canRead.mockResolvedValue(false);
});

describe('aislamiento de archivos privados', () => {
  it('deniega a otra cuenta la referencia conocida de un comprobante', async () => {
    const response = await getUpload(new Request(`https://sisco.example/api/upload?ref=${encodeURIComponent(reference)}`));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Archivo no encontrado' });
    expect(mocks.canRead).toHaveBeenCalledWith('resident-b', reference);
    expect(mocks.blobGet).not.toHaveBeenCalled();
  });

  it('aplica el mismo control al endpoint legado de archivos', async () => {
    const response = await getLegacyUpload(new Request('https://sisco.example/uploads/resident-a/11111111-1111-4111-8111-111111111111.jpg'), {
      params: Promise.resolve({ path: ['resident-a', '11111111-1111-4111-8111-111111111111.jpg'] }),
    });

    expect(response.status).toBe(404);
    expect(mocks.canRead).toHaveBeenCalledWith('resident-b', reference);
    expect(mocks.blobGet).not.toHaveBeenCalled();
  });

  it('no consulta autorización ni almacenamiento sin sesión', async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const response = await getUpload(new Request(`https://sisco.example/api/upload?ref=${encodeURIComponent(reference)}`));

    expect(response.status).toBe(401);
    expect(mocks.canRead).not.toHaveBeenCalled();
    expect(mocks.blobGet).not.toHaveBeenCalled();
  });

  it('representante de fraccionamiento A recibe 404 al intentar acceder a evidencia de fraccionamiento B', async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: 'rep-fracc-a', role: 'representante' } });
    mocks.canRead.mockResolvedValueOnce(false);

    const refEvidenciaB = 'uploads/cuadrilla-b/22222222-2222-4222-8222-222222222222.jpg';
    const response = await getUpload(new Request(`https://sisco.example/api/upload?ref=${encodeURIComponent(refEvidenciaB)}`));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Archivo no encontrado' });
    expect(mocks.canRead).toHaveBeenCalledWith('rep-fracc-a', refEvidenciaB);
    expect(mocks.blobGet).not.toHaveBeenCalled();
  });

  it('representante de fraccionamiento A recibe 200 al acceder a evidencia de su propio fraccionamiento', async () => {
    process.env.VERCEL = '1';
    mocks.getSession.mockResolvedValueOnce({ user: { id: 'rep-fracc-a', role: 'representante' } });
    mocks.canRead.mockResolvedValueOnce(true);
    mocks.blobGet.mockResolvedValueOnce({
      statusCode: 200,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]));
          controller.close();
        },
      }),
    });

    const refEvidenciaA = 'uploads/cuadrilla-a/33333333-3333-4333-8333-333333333333.jpg';
    const response = await getUpload(new Request(`https://sisco.example/api/upload?ref=${encodeURIComponent(refEvidenciaA)}`));

    expect(response.status).toBe(200);
    expect(mocks.canRead).toHaveBeenCalledWith('rep-fracc-a', refEvidenciaA);
    expect(mocks.blobGet).toHaveBeenCalled();
  });

  it('admin recibe 200 al acceder a evidencia de cualquier fraccionamiento', async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: 'admin-global', role: 'admin' } });
    mocks.canRead.mockResolvedValueOnce(true);
    mocks.blobGet.mockResolvedValueOnce({
      statusCode: 200,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]));
          controller.close();
        },
      }),
    });

    const refCualquiera = 'uploads/cuadrilla-x/44444444-4444-4444-8444-444444444444.jpg';
    const response = await getUpload(new Request(`https://sisco.example/api/upload?ref=${encodeURIComponent(refCualquiera)}`));

    expect(response.status).toBe(200);
    expect(mocks.canRead).toHaveBeenCalledWith('admin-global', refCualquiera);
    expect(mocks.blobGet).toHaveBeenCalled();
  });
});
