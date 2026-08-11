import type { CorteOperacionService } from '../services/corte-operacion.service';
import type { ConfirmarReconexionCommand } from './confirmar-reconexion.command';

type Deps = {
  corteOperacionService: Pick<CorteOperacionService, 'confirmarReconexion'>;
};

export class ConfirmarReconexionHandler {
  constructor(private deps: Deps) {}

  async execute(cmd: ConfirmarReconexionCommand) {
    return this.deps.corteOperacionService.confirmarReconexion(cmd);
  }
}
