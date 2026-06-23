export abstract class ValueObject<T> {
  protected constructor(protected readonly value: T) {
    this.validate(value);
  }

  protected abstract validate(value: T): void;

  equals(other: ValueObject<T>): boolean {
    return JSON.stringify(this.value) === JSON.stringify(other.value);
  }

  getValue(): T {
    return this.value;
  }
}
