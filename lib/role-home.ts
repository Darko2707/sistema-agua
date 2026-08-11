export function homePathForRole(role: string | null | undefined): string {
  switch (role) {
    case 'admin':
      return '/admin';
    case 'representante':
      return '/representante';
    case 'tesorera':
      return '/tesorera';
    case 'cuadrilla_cortes':
      return '/trabajador';
    default:
      return '/residente';
  }
}
