import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDownload,
  mockFindTicket,
  mockFindUser,
  mockGeneratePdf,
  mockGetSession,
  mockIsCurrentReference,
  mockRemoveLegacy,
  mockSet,
  mockUpdate,
  mockUpload,
  mockWhere,
} = vi.hoisted(() => {
  const where = vi.fn();
  const set = vi.fn(() => ({ where }));
  return {
    mockDownload: vi.fn(),
    mockFindTicket: vi.fn(),
    mockFindUser: vi.fn(),
    mockGeneratePdf: vi.fn(),
    mockGetSession: vi.fn(),
    mockIsCurrentReference: vi.fn(),
    mockRemoveLegacy: vi.fn(),
    mockSet: set,
    mockUpdate: vi.fn(() => ({ set })),
    mockUpload: vi.fn(),
    mockWhere: where,
  };
});

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: mockGetSession } },
}));

vi.mock('@/db', () => ({
  db: {
    query: {
      tickets: { findFirst: mockFindTicket },
      user: { findFirst: mockFindUser },
    },
    update: mockUpdate,
  },
}));

vi.mock('@/server/services/pdf', () => ({
  generarTicketPDF: mockGeneratePdf,
}));

vi.mock('@/src/infrastructure/storage/vercel-blob.adapter', () => ({
  VercelBlobAdapter: class {
    download = mockDownload;
    isCurrentReference = mockIsCurrentReference;
    removeLegacyPublicCopy = mockRemoveLegacy;
    upload = mockUpload;
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { GET } from '@/app/api/tickets/[folio]/pdf/route';

const FOLIO = 'TKT-1234';
const PDF = Buffer.from('%PDF-prueba');
const BASE_TICKET = {
  folio: FOLIO,
  pdfUrl: null as string | null,
  pago: {
    mes: 8,
    anio: 2026,
    monto: 123,
    montoBase: 100,
    iva: 16,
    comisionMercadoPago: 7,
    retencionIsr: 0,
    retencionIva: 0,
    circuito: { nombre: 'Circuito 1', representanteId: 'representante-1' },
    perfil: {
      userId: 'residente-1',
      edificio: 'A',
      departamento: '101',
      usuario: { name: 'Persona Residente' },
    },
  },
};

function callGet(folio = FOLIO) {
  return GET(new Request(`https://app.example/api/tickets/${folio}/pdf`), {
    params: Promise.resolve({ folio }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: 'residente-1' } });
  mockFindTicket.mockResolvedValue(BASE_TICKET);
  mockFindUser.mockResolvedValue({ role: 'residente' });
  mockGeneratePdf.mockResolvedValue(PDF);
  mockIsCurrentReference.mockReturnValue(false);
  mockRemoveLegacy.mockResolvedValue(true);
  mockUpload.mockResolvedValue(`private-tickets/${FOLIO}.pdf`);
  mockWhere.mockResolvedValue(undefined);
});

describe('GET /api/tickets/[folio]/pdf', () => {
  it('rechaza la descarga sin sesión antes de consultar el ticket', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await callGet();

    expect(response.status).toBe(401);
    expect(mockFindTicket).not.toHaveBeenCalled();
  });

  it('rechaza folios con caracteres peligrosos', async () => {
    const response = await callGet('../secreto');

    expect(response.status).toBe(400);
    expect(mockFindTicket).not.toHaveBeenCalled();
  });

  it('no permite que otro residente descargue el recibo', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'residente-2' } });

    const response = await callGet();

    expect(response.status).toBe(403);
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockGeneratePdf).not.toHaveBeenCalled();
  });

  it('regenera el recibo aunque exista Blob privado para usar la plantilla vigente sin QR', async () => {
    const privateReference = `private-tickets/${FOLIO}.pdf`;
    mockFindTicket.mockResolvedValue({ ...BASE_TICKET, pdfUrl: privateReference });
    mockIsCurrentReference.mockReturnValue(true);

    const response = await callGet('tkt-1234');

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PDF);
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockGeneratePdf).toHaveBeenCalled();
    expect(mockUpload).toHaveBeenCalledWith(FOLIO, PDF);
  });

  it('reemplaza una copia pública histórica por almacenamiento privado', async () => {
    const legacyUrl =
      `https://store.public.blob.vercel-storage.com/tickets/${FOLIO}.pdf`;
    mockFindTicket.mockResolvedValue({ ...BASE_TICKET, pdfUrl: legacyUrl });

    const response = await callGet();

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(mockRemoveLegacy).toHaveBeenCalledWith(FOLIO, legacyUrl);
    expect(mockUpload).toHaveBeenCalledWith(FOLIO, PDF);
    expect(mockSet).toHaveBeenCalledWith({ pdfUrl: `private-tickets/${FOLIO}.pdf` });
  });
});
