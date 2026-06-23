import { describe, it, expect } from 'vitest';
import { parseExternalReference } from './parser';

describe('parseExternalReference', () => {
  const REF_VALIDA = 'agua|perfil-abc123|6|2025|0|350.00';

  // ─── Casos válidos ────────────────────────────────────────────────────────

  describe('casos válidos', () => {
    it('parsea una referencia completa correctamente', () => {
      expect(parseExternalReference(REF_VALIDA)).toEqual({
        perfilId: 'perfil-abc123',
        mes: 6,
        anio: 2025,
        esReconexion: false,
        monto: '350.00',
      });
    });

    it('interpreta esReconexion "1" como true', () => {
      const ref = 'agua|abc|3|2024|1|450.50';
      expect(parseExternalReference(ref)?.esReconexion).toBe(true);
    });

    it('interpreta esReconexion "0" como false', () => {
      const ref = 'agua|abc|3|2024|0|450.50';
      expect(parseExternalReference(ref)?.esReconexion).toBe(false);
    });

    it('formatea monto entero a 2 decimales', () => {
      const ref = 'agua|abc|1|2025|0|100';
      expect(parseExternalReference(ref)?.monto).toBe('100.00');
    });

    it('formatea monto con 1 decimal a 2 decimales', () => {
      const ref = 'agua|abc|1|2025|0|99.9';
      expect(parseExternalReference(ref)?.monto).toBe('99.90');
    });

    it('acepta enero (mes 1) como válido', () => {
      const ref = 'agua|abc|1|2025|0|200.00';
      expect(parseExternalReference(ref)?.mes).toBe(1);
    });

    it('acepta diciembre (mes 12) como válido', () => {
      const ref = 'agua|abc|12|2025|0|200.00';
      expect(parseExternalReference(ref)?.mes).toBe(12);
    });

    it('no incluye el campo prefix en el resultado', () => {
      const result = parseExternalReference(REF_VALIDA);
      expect(result).not.toHaveProperty('prefix');
    });
  });

  // ─── Valores ausentes ─────────────────────────────────────────────────────

  describe('valores ausentes o vacíos', () => {
    it('retorna null si value es null', () => {
      expect(parseExternalReference(null)).toBeNull();
    });

    it('retorna null si value es undefined', () => {
      expect(parseExternalReference(undefined)).toBeNull();
    });

    it('retorna null si value es string vacío', () => {
      expect(parseExternalReference('')).toBeNull();
    });
  });

  // ─── Formato inválido ─────────────────────────────────────────────────────

  describe('formato de referencia inválido', () => {
    it('retorna null si el prefijo no es "agua" (case-sensitive)', () => {
      expect(parseExternalReference('AGUA|abc|1|2025|0|100.00')).toBeNull();
      expect(parseExternalReference('Agua|abc|1|2025|0|100.00')).toBeNull();
      expect(parseExternalReference('pago|abc|1|2025|0|100.00')).toBeNull();
    });

    it('retorna null si faltan segmentos (menos de 6)', () => {
      expect(parseExternalReference('agua|abc|1|2025|0')).toBeNull();
      expect(parseExternalReference('agua|abc')).toBeNull();
    });

    it('retorna null si hay segmentos extra (más de 6)', () => {
      expect(parseExternalReference('agua|abc|1|2025|0|100.00|extra')).toBeNull();
    });

    it('retorna null si el perfilId está vacío', () => {
      expect(parseExternalReference('agua||1|2025|0|100.00')).toBeNull();
    });
  });

  // ─── Mes inválido ─────────────────────────────────────────────────────────

  describe('mes inválido', () => {
    it('retorna null si mes es 0', () => {
      expect(parseExternalReference('agua|abc|0|2025|0|100.00')).toBeNull();
    });

    it('retorna null si mes es 13', () => {
      expect(parseExternalReference('agua|abc|13|2025|0|100.00')).toBeNull();
    });

    it('retorna null si mes es texto no numérico', () => {
      expect(parseExternalReference('agua|abc|enero|2025|0|100.00')).toBeNull();
    });

    it('retorna null si mes es decimal', () => {
      expect(parseExternalReference('agua|abc|1.5|2025|0|100.00')).toBeNull();
    });
  });

  // ─── Año inválido ─────────────────────────────────────────────────────────

  describe('año inválido', () => {
    it('retorna null si el año es anterior a 2020', () => {
      expect(parseExternalReference('agua|abc|1|2019|0|100.00')).toBeNull();
    });

    it('retorna null si el año es 2101 o mayor', () => {
      expect(parseExternalReference('agua|abc|1|2101|0|100.00')).toBeNull();
    });

    it('retorna null si el año es texto no numérico', () => {
      expect(parseExternalReference('agua|abc|1|veinte|0|100.00')).toBeNull();
    });
  });

  // ─── Monto inválido ───────────────────────────────────────────────────────

  describe('monto inválido', () => {
    it('retorna null si el monto es cero', () => {
      expect(parseExternalReference('agua|abc|1|2025|0|0')).toBeNull();
    });

    it('retorna null si el monto es negativo', () => {
      expect(parseExternalReference('agua|abc|1|2025|0|-100')).toBeNull();
    });

    it('retorna null si el monto es texto', () => {
      expect(parseExternalReference('agua|abc|1|2025|0|cien')).toBeNull();
    });

    it('retorna null si el monto está vacío', () => {
      expect(parseExternalReference('agua|abc|1|2025|0|')).toBeNull();
    });
  });
});
