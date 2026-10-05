import { describe, expect, it } from 'vitest';

import { generarFolioServicio } from '@/src/domain/pagos/folio.vo';

describe('generarFolioServicio', () => {
  it('genera folios publicos opacos, validos y no predecibles', () => {
    const folios = Array.from({ length: 100 }, () => generarFolioServicio());

    expect(new Set(folios)).toHaveLength(folios.length);
    for (const folio of folios) {
      expect(folio).toMatch(/^SRV-[A-Z0-9]{20}$/);
    }
  });
});
