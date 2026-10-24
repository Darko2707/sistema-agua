import { headers } from 'next/headers';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { put } from '@vercel/blob';

import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

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
      { error: `El archivo excede el límite máximo permitido de ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB` },
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

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blobResult = await put(safeFilename, buffer, {
        access: 'private',
        contentType: mimeType,
        addRandomSuffix: false,
        allowOverwrite: false,
        abortSignal: AbortSignal.timeout(10_000),
      });
      storedReference = blobResult.pathname;
    } else {
      // Almacenamiento local para entornos de desarrollo / pruebas
      const localDir = path.join(process.cwd(), '.uploads', session.user.id);
      await fs.mkdir(localDir, { recursive: true });
      const localPath = path.join(localDir, `${fileId}${extension}`);
      await fs.writeFile(localPath, buffer);
      storedReference = safeFilename;
    }

    logger.info('file.uploaded', {
      userId: session.user.id,
      fileId,
      size: file.size,
      mimeType,
      reference: storedReference,
    });

    return Response.json({
      ok: true,
      reference: storedReference,
      contentType: mimeType,
      size: file.size,
      name: typeof file.name === 'string' ? path.basename(file.name) : `${fileId}${extension}`,
    });
  } catch (error) {
    logger.error('file.upload_error', error, { userId: session.user.id, safeFilename });
    return Response.json({ error: 'Error al almacenar el archivo' }, { status: 500 });
  }
}

