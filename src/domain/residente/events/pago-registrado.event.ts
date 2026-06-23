import { DomainEvent } from '../../shared/domain-event';

export class PagoRegistradoEvent extends DomainEvent {
  constructor(
    residenteId: string,
    readonly folio: string,
  ) {
    super(residenteId);
  }
}
