import { describe, expect, it } from 'vitest';

import { homePathForRole } from '@/lib/role-home';

describe('homePathForRole', () => {
  it.each([
    ['admin', '/admin'],
    ['representante', '/representante'],
    ['tesorera', '/tesorera'],
    ['cuadrilla_cortes', '/trabajador'],
    ['residente', '/residente'],
    ['operador_pozo', '/acceso-no-configurado'],
  ])('dirige el rol %s a %s', (role, expected) => {
    expect(homePathForRole(role)).toBe(expected);
  });

  it.each([undefined, null, '', 'desconocido'])('deniega por defecto un rol ausente o desconocido: %j', (role) => {
    expect(homePathForRole(role)).toBe('/acceso-no-configurado');
  });
});
