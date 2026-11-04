import { headers } from 'next/headers';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { get, put } from '@vercel/blob';

import { auth } from '@/lib/auth';
import { buildComprobanteViewUrl, inlineComprobanteHeaders } from '@/lib/comprobante-file';
import { logger } from '@/lib/logger';

// Dar más tiempo a la función en Vercel para procesar uploads grandes
export const maxDuration = 30; // segundos

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#f8f9fa"/>
  <rect x="20" y="20" width="360" height="260" rx="12" fill="#ffffff" stroke="#dee2e6" stroke-width="2"/>
  <circle cx="200" cy="110" r="32" fill="#e9ecef"/>
  <path d="M185 125 L200 102 L215 125 Z" fill="#adb5bd"/>
  <circle cx="212" cy="100" r="4" fill="#adb5bd"/>
  <text x="200" y="170" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="700" fill="#343a40" text-anchor="middle">Comprobante no disponible</text>
  <text x="200" y="195" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" fill="#6c757d" text-anchor="middle">El archivo no se encuentra en el almacenamiento</text>
</svg>`;

/**
 * Valida la firma binaria (magic bytes) para prevenir que archivos ejecutables o maliciosos
 * se enmascaren con extensiones o cabeceras MIME falsificadas.
 */
export function validateFileSignature(buffer: Buffer, claimedMime: string): boolean {
  if (buffer.length < 4) return false;

  // PDF: %PDF-
  if (claimedMime === 'application/pdf') {
    return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  }

  // PNG: \x89PNG\r\n\x1a\n
  if (claimedMime === 'image/png') {
    return buffer.length >= 8 &&
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
      buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A;
  }

  // JPEG: \xFF\xD8\xFF
  if (claimedMime === 'image/jpeg') {
    return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  }

  // WEBP: RIFF....WEBP
  if (claimedMime === 'image/webp') {
    if (buffer.length < 12) return false;
    const isRiff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
    const isWebp = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    return isRiff && isWebp;
  }

  return false;
}

export async function POST(req: Request) {
  // 1. Verificación de autenticación
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (process.env.VERCEL === '1' && !process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: 'El almacenamiento de comprobantes no está configurado. Contacta al administrador del sistema.' },
      { status: 503 },
    );
  }

  // 2. Extracción del formulario multipart
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: 'Formato de formulario multipart inválido' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof Blob)) {
    return Response.json({ error: 'No se proporcionó ningún archivo en el campo "file"' }, { status: 400 });
  }

  // 3. Validación de tamaño
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return Response.json(
      { error: `El archivo excede el límite y tamaño máximo permitido de ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB. Usa una imagen más pequeña o un PDF comprimido.` },
      { status: 413 },
    );
  }

  if (file.size === 0) {
    return Response.json({ error: 'El archivo está vacío' }, { status: 400 });
  }

  // 4. Validación de tipo MIME
  const mimeType = (file.type || '').toLowerCase().trim();
  const extension = ALLOWED_MIME_TYPES[mimeType];
  if (!extension) {
    return Response.json(
      { error: 'Tipo de archivo no permitido. Solo se aceptan PDF, JPEG, PNG y WEBP' },
      { status: 400 },
    );
  }

  // 5. Validación de firma binaria (magic bytes)
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (!validateFileSignature(buffer, mimeType)) {
    return Response.json(
      { error: 'El contenido del archivo no coincide con el tipo MIME declarado (firma binaria inválida)' },
      { status: 400 },
    );
  }

  // 6. Almacenamiento seguro
  const fileId = randomUUID();
  const safeFilename = `uploads/${session.user.id}/${fileId}${extension}`;

  try {
    let storedReference: string;
    let fileUrl: string;

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blobResult = await put(safeFilename, buffer, {
        access: 'private',
        contentType: mimeType,
        addRandomSuffix: false,
        allowOverwrite: false,
        abortSignal: AbortSignal.timeout(10_000),
      });
      // Guardamos el pathname (ej. "uploads/<userId>/<uuid>.jpg") como referencia
      // estable en la BD. La URL firmada de Vercel expira; el proxy GET /api/upload
      // la regenera en cada petición autenticada.
      storedReference = blobResult.pathname;
      // El cliente recibe la URL del proxy para que todas las visualizaciones
      // pasen por la verificación de sesión.
      fileUrl = buildComprobanteViewUrl(blobResult.pathname);
    } else {
      // Fallback local para desarrollo. En Vercel exigimos Blob porque el disco
      // de una función serverless no persiste entre solicitudes.
      storedReference = safeFilename;
      fileUrl = buildComprobanteViewUrl(safeFilename);

      // En desarrollo local intentamos escribir en disco como cache/backup
      try {
        const localDir = path.join(process.cwd(), '.uploads', session.user.id);
        await fs.mkdir(localDir, { recursive: true });
        const localPath = path.join(localDir, `${fileId}${extension}`);
        await fs.writeFile(localPath, buffer);
      } catch (writeErr) {
        logger.warn('file.local_write_skipped', { safeFilename, error: writeErr });
      }
    }

    logger.info('file.uploaded', {
      userId: session.user.id,
      fileId,
      size: file.size,
      mimeType,
      reference: storedReference,
    });

    const normalizedUrl = fileUrl.startsWith('http') || fileUrl.startsWith('/') || fileUrl.startsWith('data:')
      ? fileUrl
      : `/${fileUrl}`;

    return Response.json({
      ok: true,
      reference: storedReference,
      url: normalizedUrl,
      contentType: mimeType,
      size: file.size,
      name: typeof file.name === 'string' ? path.basename(file.name) : `${fileId}${extension}`,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
    logger.error({ event: 'file.upload_error', error: errorMsg, userId: session.user.id, safeFilename });

    // Devolver un mensaje amigable según el tipo de error detectado
    if (errorMsg.includes('413') || errorMsg.includes('too large') || errorMsg.includes('size')) {
      return Response.json(
        { error: `El archivo excede el límite y tamaño máximo permitido de ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB` },
        { status: 413 },
      );
    }
    if (errorMsg.includes('timeout') || errorMsg.includes('aborted')) {
      return Response.json(
        { error: 'El servidor tardó demasiado en procesar el archivo. Intenta con una imagen más pequeña.' },
        { status: 504 },
      );
    }
    return Response.json(
      { error: 'Error al almacenar el archivo. Intenta de nuevo o usa un archivo más pequeño.' },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (process.env.VERCEL === '1' && !process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: 'El almacenamiento de comprobantes no está configurado. Contacta al administrador del sistema.' },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const ref = url.searchParams.get('ref');
  if (!ref || typeof ref !== 'string') {
    return Response.json({ error: 'Referencia inválida' }, { status: 400 });
  }

  // Si la referencia ya es un Data URL base64
  if (ref.startsWith('data:')) {
    const match = ref.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const mime = match[1].toLowerCase();
      const extension = ALLOWED_MIME_TYPES[mime];
      if (!extension) {
        return Response.json({ error: 'Tipo de comprobante no permitido' }, { status: 415 });
      }
      const buffer = Buffer.from(match[2], 'base64');
      return new Response(buffer, {
        status: 200,
        headers: inlineComprobanteHeaders(mime, extension),
      });
    }
  }

  // Prevención de directory traversal
  const normalized = path.normalize(ref).replace(/^(\.\.(\/|\\|$))+/, '');
  if (!normalized.startsWith('uploads/') && !normalized.startsWith('uploads\\')) {
    return Response.json({ error: 'Ruta no permitida' }, { status: 400 });
  }

  const extension = path.extname(normalized).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  const contentType = mimeMap[extension] || 'application/octet-stream';

  // 1. Si existe storage en Vercel Blob, descargar directamente (blob privado)
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blobResult = await get(normalized, {
        access: 'private',
        useCache: false,
        abortSignal: AbortSignal.timeout(8000),
      });
      if (blobResult?.statusCode === 200 && blobResult.stream) {
        const buffer = Buffer.from(await new Response(blobResult.stream).arrayBuffer());
        return new Response(buffer, {
          status: 200,
          headers: inlineComprobanteHeaders(contentType, extension),
        });
      }
    } catch (blobErr) {
      logger.warn('file.blob_read_error', { ref: normalized, error: blobErr });
    }
  }

  // 2. Si no, intentar leer desde el disco local
  try {
    const relativePart = normalized.replace(/^uploads[/\\]/, '');
    const localPath = path.join(process.cwd(), '.uploads', relativePart);
    const fileBuffer = await fs.readFile(localPath);

    return new Response(fileBuffer, {
      status: 200,
      headers: inlineComprobanteHeaders(contentType, extension),
    });
  } catch (error) {
    logger.warn('file.serve_not_found', { ref: normalized, error });
    const acceptHeader = req.headers.get('accept') || '';
    const isImageRequest = contentType.startsWith('image/') && (
      acceptHeader.includes('image/') || req.headers.get('sec-fetch-dest') === 'image'
    );

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

