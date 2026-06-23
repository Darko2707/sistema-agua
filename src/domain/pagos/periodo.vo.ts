import { ValueObject } from '../shared/value-object';
import { DIA_CORTE } from './constants';

type PeriodoValue = { mes: number; anio: number };

export class PeriodoVO extends ValueObject<PeriodoValue> {
  private constructor(value: PeriodoValue) {
    super(value);
  }

  protected validate(value: PeriodoValue): void {
    if (!Number.isInteger(value.mes) || value.mes < 1 || value.mes > 12) {
      throw new Error(`Mes inválido: ${value.mes}`);
    }
    if (!Number.isInteger(value.anio) || value.anio < 2020 || value.anio > 2100) {
      throw new Error(`Año inválido: ${value.anio}`);
    }
  }

  static create(mes: number, anio: number): PeriodoVO {
    return new PeriodoVO({ mes, anio });
  }

  static vigente(): PeriodoVO {
    const ahora = new Date();
    return new PeriodoVO({ mes: ahora.getMonth() + 1, anio: ahora.getFullYear() });
  }

  get mes(): number  { return this.value.mes; }
  get anio(): number { return this.value.anio; }

  get vencido(): boolean {
    return new Date().getDate() > DIA_CORTE;
  }

  toString(): string {
    return `${this.value.mes}/${this.value.anio}`;
  }
}
