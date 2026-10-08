import type { UserData, UserRepository } from '@/src/application/ports/user.repository';

export type ListarPersonalQuery = {
  rol:    'admin' | 'representante';
  fraccionamientoId?: string | null;
};

type Deps = { userRepo: UserRepository };

export class ListarPersonalHandler {
  constructor(private deps: Deps) {}

  async execute(query: ListarPersonalQuery): Promise<UserData[]> {
    const { userRepo } = this.deps;

    if (query.rol === 'representante') {
      if (!query.fraccionamientoId) return [];
      const personal = await userRepo.listarNonResidente();
      return personal.filter((usuario) => usuario.fraccionamientoId === query.fraccionamientoId);
    }

    return userRepo.listarNonResidente();
  }
}
