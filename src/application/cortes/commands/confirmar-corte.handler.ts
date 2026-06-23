import { TRPCError } from '@trpc/server';
import { ResidenteAggregate } from '@/src/domain/residente/residente.aggregate';
import type { ResidenteRepository } from '../../ports/residente.repository';
import type { PagoRepository } from '../../ports/pago.repository';
import type { ConfirmarCorteCommand } from './confirmar-corte.command';
import { aplicarTransicion, ACCIONES, type EstadoAgua } from '@/src/domain/agua/state-machine';

type Deps = {
  residenteRepo: ResidenteRepository;
  pagoRepo: PagoRepository;
};

export class ConfirmarCorteHandler {
  constructor(private deps: Deps) {}

  async execute(cmd: ConfirmarCorteCommand) {
    const { residenteRepo, pagoRepo } = this.deps;

    const data = await residenteRepo.findById(cmd.perfilId);
    if (!data) throw new TRPCError({ code: 'NOT_FOUND' });

    const ctx = { fecha: new Date(), actorId: cmd.trabajadorId };

    let resultado;
    try {
      resultado = aplicarTransicion(data.estadoAgua as EstadoAgua, ACCIONES.EJECUTAR_CORTE, ctx);
    } catch (err) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: err instanceof Error ? err.message : 'Transición inválida',
      });
    }

    let corteCreado = null;
    for (const efecto of resultado.efectos) {
      if (efecto.tipo === 'crear_corte') {
        corteCreado = await pagoRepo.crearCorte({
          perfilId:    cmd.perfilId,
          trabajadorId: efecto.trabajadorId,
          motivo:      efecto.motivo,
        });
      }
    }

    await residenteRepo.updateEstado(cmd.perfilId, resultado.nuevoEstado);
    return corteCreado;
  }
}
