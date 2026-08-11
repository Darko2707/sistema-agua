import { describe, expect, it } from 'vitest';
import {
  normalizarDepartamento,
  normalizarEdificio,
  normalizarVivienda,
  ViviendaInvalidaError,
} from '@/src/domain/residente/vivienda';

describe('vivienda', () => {
  describe('normalizarEdificio', () => {
    it.each([
      [' 8 ', '8'],
      ['08', '8'],
      ['000008', '8'],
      ['０８', '8'],
      ['  ０００１２  ', '12'],
    ])('normaliza %j como %j', (entrada, esperado) => {
      expect(normalizarEdificio(entrada)).toBe(esperado);
    });

    it.each([
      '',
      '   ',
      '0',
      '000000',
      'A',
      '8A',
      '-8',
      '+8',
      '8.1',
      '8 1',
      '1234567',
    ])('rechaza el edificio inválido %j', (entrada) => {
      expect(() => normalizarEdificio(entrada)).toThrow(ViviendaInvalidaError);
    });
  });

  describe('normalizarDepartamento', () => {
    it.each([
      ['314', '314'],
      ['314a', '314A'],
      [' 0314a ', '314A'],
      ['000001b', '1B'],
      ['０３１４ａ', '314A'],
      ['  ０００２ｃ  ', '2C'],
    ])('normaliza %j como %j', (entrada, esperado) => {
      expect(normalizarDepartamento(entrada)).toBe(esperado);
    });

    it.each([
      '',
      '   ',
      '0',
      '000000',
      '000A',
      'A',
      '314AB',
      '-314',
      '+314',
      '31.4',
      '31 4',
      '314-A',
      '1234567',
      '1234567A',
    ])('rechaza el departamento inválido %j', (entrada) => {
      expect(() => normalizarDepartamento(entrada)).toThrow(ViviendaInvalidaError);
    });
  });

  it('normaliza edificio y departamento como una sola vivienda', () => {
    expect(normalizarVivienda(' 08 ', ' 0314a ')).toEqual({
      edificio: '8',
      departamento: '314A',
    });
  });

  it('expone los errores de vivienda como BAD_REQUEST de dominio', () => {
    try {
      normalizarEdificio('0');
      throw new Error('Se esperaba ViviendaInvalidaError');
    } catch (error) {
      expect(error).toBeInstanceOf(ViviendaInvalidaError);
      expect(error).toMatchObject({ code: 'BAD_REQUEST' });
    }
  });
});
