import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUser: vi.fn(),
  findFraccionamiento: vi.fn(),
  findPerfil: vi.fn(),
  guardReportExport: vi.fn(),
  release: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

vi.mock('@/db', () => ({
  db: {
    query: {
      user: { findFirst: mocks.findUser },
      fraccionamientos: { findFirst: mocks.findFraccionamiento },
      perfilesResidente: { findFirst: mocks.findPerfil },
    },
  },
}));

vi.mock('@/lib/report-export-guard', () => ({
  guardReportExport: mocks.guardReportExport,
}));

vi.mock('@/server/services/excel-reportes', () => ({
  generarReporteResidentesExcel: vi.fn(),
  generarReporteFinancieroExcel: vi.fn(),
  generarReporteFinancieroRangoExcel: vi.fn(),
}));

import { GET as getReporteFinanciero } from '@/app/api/reportes/financiero/route';
import { GET as getReporteResidentes } from '@/app/api/reportes/residentes/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: 'tesorera-1' } });
  mocks.findUser.mockResolvedValue({
    id: 'tesorera-1',
    role: 'tesorera',
    fraccionamientoId: '11111111-1111-4111-8111-111111111111',
  });
  mocks.findFraccionamiento.mockResolvedValue(null);
  mocks.guardReportExport.mockResolvedValue({
    allowed: true,
    release: mocks.release,
  });
});

describe('reportes HTTP de tesoreria', () => {
  it.each([
    ['residentes', getReporteResidentes, 'https://app.example/api/reportes/residentes'],
    ['financiero', getReporteFinanciero, 'https://app.example/api/reportes/financiero'],
  ])('el reporte %s exige fraccionamiento activo asignado a la tesorera', async (_name, handler, url) => {
    const response = await handler(new Request(url));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Sin fraccionamiento activo asignado');
    expect(mocks.findFraccionamiento).toHaveBeenCalledTimes(1);
    expect(mocks.findPerfil).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});
