export const MAX_EVIDENCE_FILES = 5;
export const MAX_EVIDENCE_FILE_SIZE = 5 * 1024 * 1024;

const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type EvidenceImageType = keyof typeof IMAGE_TYPES;

export function evidenceImageExtension(contentType: EvidenceImageType): string {
  return IMAGE_TYPES[contentType];
}

export function hasValidEvidenceImageSignature(buffer: Buffer, contentType: string): contentType is EvidenceImageType {
  if (contentType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (contentType === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (contentType === 'image/webp') {
    return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

export async function parseEvidenceFiles(files: File[]): Promise<
  | { ok: true; files: Array<{ buffer: Buffer; contentType: EvidenceImageType; size: number }> }
  | { ok: false; error: string; status: number }
> {
  if (files.length === 0) return { ok: false, error: 'Selecciona al menos una fotografía', status: 400 };
  if (files.length > MAX_EVIDENCE_FILES) return { ok: false, error: `Puedes subir hasta ${MAX_EVIDENCE_FILES} fotografías por actividad`, status: 400 };

  const parsed: Array<{ buffer: Buffer; contentType: EvidenceImageType; size: number }> = [];
  for (const file of files) {
    if (file.size === 0) return { ok: false, error: 'Una de las fotografías está vacía', status: 400 };
    if (file.size > MAX_EVIDENCE_FILE_SIZE) return { ok: false, error: 'Cada fotografía debe pesar como máximo 5 MB', status: 413 };
    const contentType = file.type.toLowerCase().trim();
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!hasValidEvidenceImageSignature(buffer, contentType)) {
      return { ok: false, error: 'Solo se aceptan imágenes JPEG, PNG o WEBP válidas', status: 400 };
    }
    parsed.push({ buffer, contentType, size: file.size });
  }
  return { ok: true, files: parsed };
}
