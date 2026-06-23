import { put } from '@vercel/blob';

/**
 * Descarga un PDF desde su URL de Vercel Blob.
 * Retorna null si no existe (404); lanza en cualquier otro error de red.
 */
export async function storageGet(url: string): Promise<Buffer | null> {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Blob fetch failed: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Sube un PDF a Vercel Blob y retorna la URL pública inmutable.
 * addRandomSuffix: false → URL determinista por folio.
 * La URL es pública pero sirve a través de la ruta autenticada, no directamente.
 */
export async function storagePut(folio: string, data: Buffer): Promise<string> {
  const { url } = await put(`tickets/${folio}.pdf`, data, {
    access:          'public',
    contentType:     'application/pdf',
    addRandomSuffix: false,
  });
  return url;
}