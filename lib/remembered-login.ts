export const REMEMBERED_LOGIN_EMAIL_KEY = 'sis4s.login.remembered-email.v1';

type LoginStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): LoginStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function normalizeRememberedLoginEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length === 0 ||
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+$/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

export function readRememberedLoginEmail(
  storage: LoginStorage | null = browserStorage(),
): string {
  if (!storage) return '';
  try {
    const stored = storage.getItem(REMEMBERED_LOGIN_EMAIL_KEY);
    return stored ? (normalizeRememberedLoginEmail(stored) ?? '') : '';
  } catch {
    return '';
  }
}

export function writeRememberedLoginEmail(
  email: string,
  remember: boolean,
  storage: LoginStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    const normalized = remember ? normalizeRememberedLoginEmail(email) : null;
    if (normalized) {
      storage.setItem(REMEMBERED_LOGIN_EMAIL_KEY, normalized);
    } else {
      storage.removeItem(REMEMBERED_LOGIN_EMAIL_KEY);
    }
  } catch {
    // El inicio de sesion debe seguir funcionando en modo privado o cuando el
    // navegador bloquea el almacenamiento local.
  }
}
