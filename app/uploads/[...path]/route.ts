import { headers } from 'next/headers';
import fs from 'node:fs/promises';
import path from 'node:path';
import { get } from '@vercel/blob';

import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#f8f9fa"/>
  <rect x="20" y="20" width="360" height="260" rx="12" fill="#ffffff" stroke="#dee2e6" stroke-width="2"/>
  <circle cx="200" cy="110" r="32" fill="#e9ecef"/>
  <path d="M185 125 L200 102 L215 125 Z" fill="#adb5bd"/>
  <circle cx="212" cy="100" r="4" fill="#adb5bd"/>
  <text x="200" y="170" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="700" fill="#343a40" text-anchor="middle">Comprobante no disponible</text>
  <text x="200" y="195" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" fill="#6c757d" text-anchor="middle">El archivo no se encuentra en el almacenamiento</text>
</svg>`;

export async function GET(
  req: Request,
  props: { params: Promise<{ path: string[] }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { path: segments } = await props.params;
  const relativePart = path.join(...segments);
  const normalized = path.normalize(relativePart).replace(/^(\.\.(\/|\\|$))+/, '');

  const extension = path.extname(normalized).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  const contentType = mimeMap[extension] || 'application/octet-stream';

  // 1. Si existe storage en Vercel Blob
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blobResult = await get(`uploads/${normalized}`, {
        access: 'public',
        useCache: false,
        abortSignal: AbortSignal.timeout(8000),
      });
      if (blobResult?.statusCode === 200 && blobResult.stream) {
        const buffer = Buffer.from(await new Response(blobResult.stream).arrayBuffer());
        return new Response(buffer, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'private, max-age=3600',
          },
        });
      }
    } catch (blobErr) {
      logger.warn('uploads.blob_read_error', { path: normalized, error: blobErr });
    }
  }

  // 2. Intentar leer desde el disco local
  try {
    const localPath = path.join(process.cwd(), '.uploads', normalized);
    const fileBuffer = await fs.readFile(localPath);

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    logger.warn('uploads.serve_not_found', { path: normalized, error });
    const acceptHeader = req.headers.get('accept') || '';
    const isImageRequest = acceptHeader.includes('image/') ||
      acceptHeader.includes('text/html') ||
      req.headers.get('sec-fetch-dest') === 'image';

    if (isImageRequest) {
      return new Response(PLACEHOLDER_SVG, {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'no-cache',
        },
      });
    }
    return Response.json({ error: 'Archivo no encontrado' }, { status: 404 });
  }
}
