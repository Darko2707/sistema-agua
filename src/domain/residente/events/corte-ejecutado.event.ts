import { DomainEvent } from '../../shared/domain-event';

export class CorteEjecutadoEvent extends DomainEvent {
  constructor(
    residenteId: string,
    readonly trabajadorId: string,
    readonly fecha: Date,
  ) {
    super(residenteId);
  }
}
