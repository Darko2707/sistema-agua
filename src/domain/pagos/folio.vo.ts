import { ValueObject } from '../shared/value-object';
import { customAlphabet } from 'nanoid';

const FOLIO_REGEX = /^AGU-[A-Z0-9]{10}$/;
const folioNanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 10);
const folioServicioNanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 20);

/**
 * Genera un folio publico opaco para cargos de servicio.
 *
 * El folio nunca debe derivarse del paymentId del proveedor: se muestra en
 * comprobantes y en la verificacion publica. Los 20 caracteres base36 aportan
 * mas de 100 bits de entropia y evitan revelar identificadores internos o de
 * Mercado Pago.
 */
export function generarFolioServicio(): string {
  return `SRV-${folioServicioNanoid()}`;
}

export class FolioVO extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  protected validate(value: string): void {
    if (!FOLIO_REGEX.test(value)) {
      throw new Error(`Folio inválido: ${value}`);
    }
  }

  static generate(): FolioVO {
    return new FolioVO(`AGU-${folioNanoid()}`);
  }

  static fromString(value: string): FolioVO {
    return new FolioVO(value);
  }

  toString(): string {
    return this.getValue();
  }
}
