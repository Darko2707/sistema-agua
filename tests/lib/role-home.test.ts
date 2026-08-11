import { describe, expect, it } from 'vitest';

import { homePathForRole } from '@/lib/role-home';

describe('homePathForRole', () => {
  it.each([
    ['admin', '/admin'],
    ['representante', '/representante'],
    ['tesorera', '/tesorera'],
    ['cuadrilla_cortes', '/trabajador'],
    ['residente', '/residente'],
  ])('dirige el rol %s a %s', (role, expected) => {
    expect(homePathForRole(role)).toBe(expected);
  });

  it.each([undefined, null, '', 'desconocido'])('usa residente como ruta segura para %j', (role) => {
    expect(homePathForRole(role)).toBe('/residente');
  });
});
