import { z } from 'zod';

// Formato: agua|perfilId|mes|anio|esReconexion|monto
const ExternalReferenceSchema = z.object({
  prefix:       z.literal('agua'),
  perfilId:     z.string().min(1),
  mes:          z.coerce.number().int().min(1).max(12),
  anio:         z.coerce.number().int().min(2020).max(2100),
  esReconexion: z.string().transform(v => v === '1'),
  monto:        z.string()
    .refine(v => Number.isFinite(Number(v)) && Number(v) > 0)
    .transform(v => Number(v).toFixed(2)),
});

type ParsedReference = z.infer<typeof ExternalReferenceSchema>;
export type ExternalReference = Omit<ParsedReference, 'prefix'>;

export function parseExternalReference(value: string | null | undefined): ExternalReference | null {
  if (!value) return null;
  const parts = value.split('|');
  if (parts.length !== 6) return null;
  const [prefix, perfilId, mes, anio, esReconexion, monto] = parts;
  const result = ExternalReferenceSchema.safeParse({ prefix, perfilId, mes, anio, esReconexion, monto });
  if (!result.success) return null;
  const { prefix: _prefix, ...ref } = result.data;
  return ref;
}
