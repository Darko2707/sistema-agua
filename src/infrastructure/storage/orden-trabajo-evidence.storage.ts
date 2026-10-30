import { del, get, put } from '@vercel/blob';
import fs from 'node:fs/promises';
import path from 'node:path';

const PREFIX = 'private-operational-evidence';
const TIMEOUT_MS = 8_000;

function key(fraccionamientoId: string, ordenId: string, evidenceId: string, extension: string) {
  return `${PREFIX}/${fraccionamientoId}/${ordenId}/${evidenceId}.${extension}`;
}

export class OrdenTrabajoEvidenceStorage {
  async upload(input: { fraccionamientoId: string; ordenId: string; evidenceId: string; extension: string; contentType: string; buffer: Buffer }) {
    const pathname = key(input.fraccionamientoId, input.ordenId, input.evidenceId, input.extension);
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const result = await put(pathname, input.buffer, {
        access: 'private', contentType: input.contentType, addRandomSuffix: false, allowOverwrite: false,
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return result.pathname;
    }
    const localPath = path.join(process.cwd(), '.uploads', ...pathname.split('/'));
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, input.buffer, { flag: 'wx' });
    return pathname;
  }

  async download(reference: string): Promise<Buffer | null> {
    if (!reference.startsWith(`${PREFIX}/`) || reference.includes('..')) return null;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const result = await get(reference, { access: 'private', useCache: false, abortSignal: AbortSignal.timeout(TIMEOUT_MS) });
      return result?.statusCode === 200 ? Buffer.from(await new Response(result.stream).arrayBuffer()) : null;
    }
    try {
      return await fs.readFile(path.join(process.cwd(), '.uploads', ...reference.split('/')));
    } catch { return null; }
  }

  async remove(reference: string): Promise<void> {
    if (!reference.startsWith(`${PREFIX}/`) || reference.includes('..')) return;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      await del(reference, { abortSignal: AbortSignal.timeout(TIMEOUT_MS) });
      return;
    }
    await fs.rm(path.join(process.cwd(), '.uploads', ...reference.split('/')), { force: true });
  }
}
