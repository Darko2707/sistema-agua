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
