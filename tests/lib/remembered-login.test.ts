import { describe, expect, it } from 'vitest';

import {
  normalizeRememberedLoginEmail,
  readRememberedLoginEmail,
  REMEMBERED_LOGIN_EMAIL_KEY,
  writeRememberedLoginEmail,
} from '@/lib/remembered-login';

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(REMEMBERED_LOGIN_EMAIL_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe('recordar usuario en login', () => {
  it('normaliza y recupera solamente un correo valido', () => {
    const storage = memoryStorage('  Residente@Ejemplo.COM ');
    expect(readRememberedLoginEmail(storage)).toBe('residente@ejemplo.com');
    expect(normalizeRememberedLoginEmail('sin-correo')).toBeNull();
    expect(readRememberedLoginEmail(memoryStorage('valor manipulado'))).toBe('');
  });

  it('guarda solo el correo normalizado cuando el usuario acepta', () => {
    const storage = memoryStorage();
    writeRememberedLoginEmail('  Persona@Ejemplo.COM ', true, storage);
    expect(storage.getItem(REMEMBERED_LOGIN_EMAIL_KEY)).toBe('persona@ejemplo.com');
  });

  it('elimina el correo al desactivar la opcion', () => {
    const storage = memoryStorage('persona@ejemplo.com');
    writeRememberedLoginEmail('persona@ejemplo.com', false, storage);
    expect(storage.getItem(REMEMBERED_LOGIN_EMAIL_KEY)).toBeNull();
  });

  it('no interrumpe el login cuando el almacenamiento esta bloqueado', () => {
    const blockedStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };

    expect(readRememberedLoginEmail(blockedStorage)).toBe('');
    expect(() => writeRememberedLoginEmail('persona@ejemplo.com', true, blockedStorage))
      .not.toThrow();
  });
});
