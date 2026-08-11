import { del, get, put } from '@vercel/blob';
import type { PdfStorage } from '@/src/application/ports/pdf-storage';

const PRIVATE_PREFIX = 'private-tickets';
const BLOB_TIMEOUT_MS = 8_000;

function privatePath(key: string): string {
  return `${PRIVATE_PREFIX}/${key}.pdf`;
}

export class VercelBlobAdapter implements PdfStorage {
  async upload(key: string, buffer: Buffer): Promise<string> {
    const { pathname } = await put(privatePath(key), buffer, {
      access:          'private',
      contentType:     'application/pdf',
      addRandomSuffix: false,
      allowOverwrite:  true,
      abortSignal:     AbortSignal.timeout(BLOB_TIMEOUT_MS),
    });
    // A pathname is an internal identifier; unlike a public URL, it grants no access.
    return pathname;
  }

  isCurrentReference(key: string, reference: string): boolean {
    return reference === privatePath(key);
  }

  async download(key: string, reference: string): Promise<Buffer | null> {
    if (!this.isCurrentReference(key, reference)) return null;

    const result = await get(reference, {
      access:      'private',
      useCache:    false,
      abortSignal: AbortSignal.timeout(BLOB_TIMEOUT_MS),
    });
    if (!result || result.statusCode !== 200) return null;

    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }

  async removeLegacyPublicCopy(key: string, reference: string): Promise<boolean> {
    let url: URL;
    try {
      url = new URL(reference);
    } catch {
      return false;
    }

    const isVercelPublicBlob =
      url.protocol === 'https:' &&
      url.hostname.endsWith('.public.blob.vercel-storage.com');
    const isExpectedTicket = url.pathname === `/tickets/${key}.pdf`;
    if (!isVercelPublicBlob || !isExpectedTicket) return false;

    await del(reference, { abortSignal: AbortSignal.timeout(BLOB_TIMEOUT_MS) });
    return true;
  }
}
