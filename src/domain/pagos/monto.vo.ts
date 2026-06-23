import { ValueObject } from '../shared/value-object';

export class MontoVO extends ValueObject<number> {
  private constructor(value: number) {
    super(value);
  }

  protected validate(value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Monto inválido: ${value}`);
    }
  }

  static create(value: number): MontoVO {
    return new MontoVO(Math.round((value + Number.EPSILON) * 100) / 100);
  }

  static fromString(value: string): MontoVO {
    const num = Number(value);
    if (!Number.isFinite(num)) throw new Error(`Monto inválido: ${value}`);
    return MontoVO.create(num);
  }

  add(other: MontoVO): MontoVO {
    return MontoVO.create(this.value + other.value);
  }

  toFixed(): string {
    return this.value.toFixed(2);
  }
}
