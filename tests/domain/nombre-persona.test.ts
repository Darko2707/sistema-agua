import { describe, expect, it } from 'vitest';
import {
  esNombrePersonaValido,
  normalizarNombrePersona,
} from '@/src/domain/usuarios/nombre-persona';

describe('nombre de persona', () => {
  it.each([
    ['juan pérez', 'Juan Pérez'],
    ['  MARÍA   DEL CARMEN  ', 'María Del Carmen'],
    ['josé luis de la cruz', 'José Luis De La Cruz'],
    ['in\u0303igo mun\u0303oz', 'Iñigo Muñoz'],
    ['lüisa ñúñez', 'Lüisa Ñúñez'],
  ])('normaliza %j como %j', (entrada, esperado) => {
    expect(normalizarNombrePersona(entrada)).toBe(esperado);
    expect(esNombrePersonaValido(entrada)).toBe(true);
  });

  it.each([
    'Juan2 Pérez',
    'Ana-María López',
    "Sean O'Connor",
    'José_Luis',
    'María@Pérez',
    'Pedro.',
    'Juan 😊',
    '1234',
  ])('rechaza números o símbolos en %j', (nombre) => {
    expect(esNombrePersonaValido(nombre)).toBe(false);
  });

  it.each(['', ' ', 'A', 'A'.repeat(121)])('rechaza longitud inválida en %j', (nombre) => {
    expect(esNombrePersonaValido(nombre)).toBe(false);
  });

  it('tolera espacios de entrada y los reduce a uno', () => {
    expect(esNombrePersonaValido('\tJuan\nPérez  López\t')).toBe(true);
    expect(normalizarNombrePersona('\tJuan\nPérez  López\t')).toBe('Juan Pérez López');
  });
});
