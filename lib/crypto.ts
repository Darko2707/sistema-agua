import crypto from 'node:crypto';

const ALGO    = 'aes-256-gcm';
const KEY_LEN = 32; // 256 bits
const IV_LEN  = 12; // 96 bits — recomendado para GCM

function getKey(): Buffer {
  const raw = process.env.MP_ENCRYPTION_KEY;
  if (!raw) throw new Error('MP_ENCRYPTION_KEY no está configurado');
  const buf = Buffer.from(raw, 'hex');
  if (buf.length !== KEY_LEN) {
    throw new Error('MP_ENCRYPTION_KEY debe ser exactamente 32 bytes (64 caracteres hex)');
  }
  return buf;
}

/** Formato en DB: `<iv_hex>:<tag_hex>:<ciphertext_hex>` */
export function encryptToken(plain: string): string {
  const key    = getKey();
  const iv     = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc    = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptToken(ciphertext: string): string {
  const key  = getKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Token cifrado con formato inválido');
  const [ivHex, tagHex, encHex] = parts;
  const iv       = Buffer.from(ivHex,  'hex');
  const tag      = Buffer.from(tagHex, 'hex');
  const enc      = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc).toString('utf8') + decipher.final('utf8');
}

/** Detecta si el valor ya está cifrado con el formato iv:tag:enc */
export function isEncrypted(value: string): boolean {
  return /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/i.test(value);
}

/**
 * Descifra si está cifrado; devuelve el valor tal cual si no lo está.
 * Permite migración gradual: tokens viejos siguen funcionando hasta
 * que se actualicen por la UI.
 */
export function decryptTokenSafe(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return isEncrypted(value) ? decryptToken(value) : value;
  } catch {
    return value; // si falla el descifrado, devuelve el raw para no romper pagos
  }
}
