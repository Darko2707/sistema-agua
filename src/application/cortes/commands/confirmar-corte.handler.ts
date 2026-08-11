import type { CorteOperacionService } from '../services/corte-operacion.service';
import type { ConfirmarCorteCommand } from './confirmar-corte.command';

type Deps = {
  corteOperacionService: Pick<CorteOperacionService, 'confirmarCorte'>;
};

export class ConfirmarCorteHandler {
  constructor(private deps: Deps) {}

  async execute(cmd: ConfirmarCorteCommand) {
    return this.deps.corteOperacionService.confirmarCorte(cmd);
  }
}
