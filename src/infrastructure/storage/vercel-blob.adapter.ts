import { put } from '@vercel/blob';
import type { PdfStorage } from '@/src/application/ports/pdf-storage';

export class VercelBlobAdapter implements PdfStorage {
  async upload(key: string, buffer: Buffer): Promise<string> {
    const { url } = await put(`tickets/${key}.pdf`, buffer, {
      access:          'public',
      contentType:     'application/pdf',
      addRandomSuffix: false,
    });
    return url;
  }

  async getUrl(key: string): Promise<string> {
    return `${process.env.BLOB_BASE_URL ?? ''}/tickets/${key}.pdf`;
  }

  async exists(key: string): Promise<boolean> {
    try {
      const res = await fetch(`${process.env.BLOB_BASE_URL ?? ''}/tickets/${key}.pdf`, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  }
}
