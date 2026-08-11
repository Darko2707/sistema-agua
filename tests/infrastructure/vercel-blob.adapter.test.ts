import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockDel, mockGet, mockPut } = vi.hoisted(() => ({
  mockDel: vi.fn(),
  mockGet: vi.fn(),
  mockPut: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
  del: mockDel,
  get: mockGet,
  put: mockPut,
}));

import { VercelBlobAdapter } from '@/src/infrastructure/storage/vercel-blob.adapter';

const FOLIO = 'TKT-1234';
const PRIVATE_REFERENCE = `private-tickets/${FOLIO}.pdf`;

afterEach(() => {
  vi.clearAllMocks();
});

describe('VercelBlobAdapter', () => {
  it('guarda recibos como privados y persiste solo el pathname interno', async () => {
    mockPut.mockResolvedValue({ pathname: PRIVATE_REFERENCE });
    const adapter = new VercelBlobAdapter();

    await expect(adapter.upload(FOLIO, Buffer.from('pdf'))).resolves.toBe(PRIVATE_REFERENCE);
    expect(mockPut).toHaveBeenCalledWith(
      PRIVATE_REFERENCE,
      expect.any(Buffer),
      expect.objectContaining({
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/pdf',
      }),
    );
  });

  it('no intenta descargar referencias públicas o ajenas', async () => {
    const adapter = new VercelBlobAdapter();

    await expect(adapter.download(FOLIO, 'https://example.com/ticket.pdf')).resolves.toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('descarga un recibo privado usando credenciales del servidor', async () => {
    const bytes = new TextEncoder().encode('pdf privado');
    mockGet.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
    });
    const adapter = new VercelBlobAdapter();

    const result = await adapter.download(FOLIO, PRIVATE_REFERENCE);

    expect(result?.toString()).toBe('pdf privado');
    expect(mockGet).toHaveBeenCalledWith(
      PRIVATE_REFERENCE,
      expect.objectContaining({ access: 'private', useCache: false }),
    );
  });

  it('elimina únicamente la copia pública histórica del mismo folio', async () => {
    mockDel.mockResolvedValue(undefined);
    const adapter = new VercelBlobAdapter();
    const legacyUrl =
      `https://store.public.blob.vercel-storage.com/tickets/${FOLIO}.pdf`;

    await expect(adapter.removeLegacyPublicCopy(FOLIO, legacyUrl)).resolves.toBe(true);
    expect(mockDel).toHaveBeenCalledWith(legacyUrl, expect.any(Object));
  });

  it.each([
    'not-a-url',
    `https://attacker.example/tickets/${FOLIO}.pdf`,
    'https://store.public.blob.vercel-storage.com/tickets/OTRO.pdf',
    `http://store.public.blob.vercel-storage.com/tickets/${FOLIO}.pdf`,
  ])('rechaza una referencia histórica fuera de la ruta permitida: %s', async (reference) => {
    const adapter = new VercelBlobAdapter();

    await expect(adapter.removeLegacyPublicCopy(FOLIO, reference)).resolves.toBe(false);
    expect(mockDel).not.toHaveBeenCalled();
  });
});
