import type { UserData, UserRepository } from '@/src/application/ports/user.repository';
import type { CircuitoRepository } from '@/src/application/ports/circuito.repository';

export type ListarPersonalQuery = {
  rol:    'admin' | 'representante';
  userId: string;
};

type Deps = { userRepo: UserRepository; circuitoRepo: CircuitoRepository };

export class ListarPersonalHandler {
  constructor(private deps: Deps) {}

  async execute(query: ListarPersonalQuery): Promise<UserData[]> {
    const { userRepo, circuitoRepo } = this.deps;

    if (query.rol === 'representante') {
      const circuito = await circuitoRepo.findByRepresentante(query.userId);
      if (!circuito) return [];
      return userRepo.listarPorCircuito(circuito.id);
    }

    return userRepo.listarNonResidente();
  }
}
