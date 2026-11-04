import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canRead: vi.fn(),
  blobGet: vi.fn(),
}));

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
});
