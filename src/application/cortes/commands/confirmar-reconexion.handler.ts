import { TRPCError } from '@trpc/server';
import { aplicarTransicion, ACCIONES, type EstadoAgua } from '@/src/domain/agua/state-machine';
import type { ResidenteRepository } from '../../ports/residente.repository';
import type { PagoRepository } from '../../ports/pago.repository';
import type { ConfirmarReconexionCommand } from './confirmar-reconexion.command';

type Deps = {
  residenteRepo: ResidenteRepository;
  pagoRepo: PagoRepository;
};

export class ConfirmarReconexionHandler {
  constructor(private deps: Deps) {}

  async execute(cmd: ConfirmarReconexionCommand) {
    const { residenteRepo, pagoRepo } = this.deps;

    const data = await residenteRepo.findById(cmd.perfilId);
    if (!data) throw new TRPCError({ code: 'NOT_FOUND' });

    const accion = data.estadoAgua === 'pendiente_reconexion'
      ? ACCIONES.EJECUTAR_RECONEXION
      : ACCIONES.RECONEXION_DIRECTA;

    const ctx = { fecha: new Date(), actorId: cmd.actorId };
    let resultado;
    try {
      resultado = aplicarTransicion(data.estadoAgua as EstadoAgua, accion, ctx);
    } catch (err) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: err instanceof Error ? err.message : 'Transición inválida',
      });
    }

    for (const efecto of resultado.efectos) {
      if (efecto.tipo === 'cerrar_corte') {
        const corteActivo = await pagoRepo.findCorteActivo(cmd.perfilId);
        if (corteActivo) {
          await pagoRepo.cerrarCorte(corteActivo.id, efecto.fecha, efecto.reconectadoPor ?? cmd.actorId);
        }
      }
    }

    await residenteRepo.updateEstado(cmd.perfilId, resultado.nuevoEstado);
    return { ok: true };
  }
}
