import { describe, expect, it } from 'vitest';

import { readBodyCloneWithLimit } from '@/lib/request-body-limit';

describe('bounded request body reader', () => {
  it('rechaza un body mayor al limite aunque omita Content-Length', async () => {
    const request = new Request('https://example.test/api', {
      method: 'POST',
      body: 'x'.repeat(33),
    });
    expect(request.headers.get('content-length')).toBeNull();
    expect(await readBodyCloneWithLimit(request, 32)).toEqual({ status: 'too_large' });
  });

  it('no confia en un Content-Length declarado menor al body real', async () => {
    const request = new Request('https://example.test/api', {
      method: 'POST',
      headers: { 'content-length': '1' },
      body: 'x'.repeat(33),
    });
    expect(await readBodyCloneWithLimit(request, 32)).toEqual({ status: 'too_large' });
  });

  it('corta un stream por chunks al superar el limite', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('1234567890'));
        controller.enqueue(encoder.encode('abcdefghij'));
        controller.close();
      },
    });
    const request = new Request('https://example.test/api', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    expect(await readBodyCloneWithLimit(request, 15)).toEqual({ status: 'too_large' });
  });

  it('devuelve bytes acotados y conserva el body original', async () => {
    const request = new Request('https://example.test/api', {
      method: 'POST',
      body: 'contenido',
    });
    const result = await readBodyCloneWithLimit(request, 32);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(new TextDecoder().decode(result.bytes)).toBe('contenido');
    }
    expect(await request.text()).toBe('contenido');
  });
});
