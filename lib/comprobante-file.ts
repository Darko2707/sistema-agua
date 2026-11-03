const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export function buildComprobanteViewUrl(reference: string): string {
  if (reference.startsWith('data:')) return reference;
  return `/api/upload?ref=${encodeURIComponent(reference)}`;
}

export function getComprobanteMimeType(reference: string | null | undefined): string | null {
  if (!reference) return null;

  const value = reference.trim();
  const dataUrlMime = /^data:([^;,]+);base64,/i.exec(value)?.[1]?.toLowerCase();
  if (dataUrlMime) return dataUrlMime;

  try {
    const parsed = new URL(value, 'http://localhost');
    const declaredMime = parsed.searchParams.get('response-content-type')
      ?? parsed.searchParams.get('content-type');
    if (declaredMime) return declaredMime.toLowerCase();

    const storedReference = parsed.searchParams.get('ref');
    if (storedReference?.startsWith('data:')) return getComprobanteMimeType(storedReference);
    const candidate = storedReference ?? parsed.pathname;
    const extension = /\.[a-z0-9]+$/i.exec(candidate.split(/[?#]/, 1)[0] ?? '')?.[0]?.toLowerCase();
    return extension ? MIME_BY_EXTENSION[extension] ?? null : null;
  } catch {
    return null;
  }
}

export function isPdfComprobante(reference: string | null | undefined): boolean {
  return getComprobanteMimeType(reference) === 'application/pdf';
}

export function inlineComprobanteHeaders(contentType: string, extension?: string): HeadersInit {
  const safeExtension = extension && /^\.[a-z0-9]{1,8}$/i.test(extension) ? extension : '.bin';
  return {
    'Content-Type': contentType,
    'Content-Disposition': `inline; filename="comprobante${safeExtension}"`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=300',
  };
}
