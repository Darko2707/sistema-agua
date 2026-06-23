import { AggregateRoot } from '../shared/aggregate-root';
import {
  EstadoAgua,
  ACCIONES,
  aplicarTransicion,
  type ContextoTransicion,
} from '../agua/state-machine';
import { PagoRegistradoEvent } from './events/pago-registrado.event';
import { CorteEjecutadoEvent } from './events/corte-ejecutado.event';

export type ResidenteProps = {
  id: string;
  userId: string;
  circuitoId: string;
  edificio: string;
  departamento: string;
  estadoAgua: EstadoAgua;
};

export class ResidenteAggregate extends AggregateRoot {
  private constructor(private props: ResidenteProps) {
    super();
  }

  static reconstitute(props: ResidenteProps): ResidenteAggregate {
    return new ResidenteAggregate(props);
  }

  get id(): string           { return this.props.id; }
  get estadoAgua(): EstadoAgua { return this.props.estadoAgua; }

  registrarPago(folio: string): void {
    if (this.props.estadoAgua === 'activo') {
      this.emit(new PagoRegistradoEvent(this.props.id, folio));
      return;
    }
    const accion = this.props.estadoAgua === 'cortado'
      ? ACCIONES.PAGAR_RECONEXION
      : ACCIONES.PAGAR_PENDIENTE;
    const resultado = aplicarTransicion(this.props.estadoAgua, accion, { fecha: new Date() });
    this.props.estadoAgua = resultado.nuevoEstado;
    this.emit(new PagoRegistradoEvent(this.props.id, folio));
  }

  confirmarCorte(ctx: ContextoTransicion): void {
    const resultado = aplicarTransicion(this.props.estadoAgua, ACCIONES.EJECUTAR_CORTE, ctx);
    this.props.estadoAgua = resultado.nuevoEstado;
    this.emit(new CorteEjecutadoEvent(this.props.id, ctx.actorId ?? '', ctx.fecha));
  }

  confirmarReconexion(ctx: ContextoTransicion): void {
    const accion = this.props.estadoAgua === 'pendiente_reconexion'
      ? ACCIONES.EJECUTAR_RECONEXION
      : ACCIONES.RECONEXION_DIRECTA;
    const resultado = aplicarTransicion(this.props.estadoAgua, accion, ctx);
    this.props.estadoAgua = resultado.nuevoEstado;
  }
}
