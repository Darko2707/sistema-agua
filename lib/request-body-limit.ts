export type LimitedBodyRead =
  | { status: 'ok'; bytes: Uint8Array }
  | { status: 'too_large' }
  | { status: 'unreadable' };

function declaredBodyTooLarge(request: Request, maxBytes: number): boolean {
  const rawLength = request.headers.get('content-length');
  if (rawLength === null) return false;
  if (!/^\d+$/.test(rawLength.trim())) return true;
  const length = Number(rawLength);
  return !Number.isSafeInteger(length) || length > maxBytes;
}

/**
 * Reads a cloned request stream up to a strict byte ceiling. Successful reads
 * leave the original body untouched for Better Auth/tRPC; rejected streams are
 * cancelled. This also covers chunked requests and requests without
 * Content-Length without ever retaining more than maxBytes.
 */
export async function readBodyCloneWithLimit(
  request: Request,
  maxBytes: number,
): Promise<LimitedBodyRead> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new TypeError('maxBytes debe ser un entero no negativo');
  }
  if (declaredBodyTooLarge(request, maxBytes)) return { status: 'too_large' };

  let clone: Request;
  try {
    clone = request.clone();
  } catch {
    return { status: 'unreadable' };
  }

  if (!clone.body) return { status: 'ok', bytes: new Uint8Array() };

  const reader = clone.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        const cancellations: Promise<unknown>[] = [reader.cancel('body limit exceeded')];
        if (request.body && !request.body.locked) {
          cancellations.push(request.body.cancel('body limit exceeded'));
        }
        await Promise.allSettled(cancellations);
        return { status: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    const cancellations: Promise<unknown>[] = [reader.cancel('body read failed')];
    if (request.body && !request.body.locked) {
      cancellations.push(request.body.cancel('body read failed'));
    }
    await Promise.allSettled(cancellations);
    return { status: 'unreadable' };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { status: 'ok', bytes };
}
