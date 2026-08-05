import { z } from 'zod';

const MoneySchema = z.string()
  .refine(v => Number.isFinite(Number(v)) && Number(v) >= 0)
  .transform(v => Number(v).toFixed(2));

// Formato legado: agua|perfilId|mes|anio|esReconexion|monto
const ExternalReferenceSchema = z.object({
  prefix:       z.literal('agua'),
  perfilId:     z.string().min(1),
  mes:          z.coerce.number().int().min(1).max(12),
  anio:         z.coerce.number().int().min(2020).max(2100),
  esReconexion: z.string().transform(v => v === '1'),
  monto:        MoneySchema.refine(v => Number(v) > 0),
});

// Formato actual: agua2|perfilId|mes|anio|mesesAdelantados|esReconexion|montoMensual|montoReconexion
const ExternalReferenceV2Schema = z.object({
  prefix:            z.literal('agua2'),
  perfilId:          z.string().min(1),
  mes:               z.coerce.number().int().min(1).max(12),
  anio:              z.coerce.number().int().min(2020).max(2100),
  mesesAdelantados:  z.coerce.number().int().min(1).max(12),
  esReconexion:      z.string().transform(v => v === '1'),
  montoMensual:      MoneySchema.refine(v => Number(v) > 0),
  montoReconexion:   MoneySchema,
});

type ParsedReference = z.infer<typeof ExternalReferenceSchema>;
type ParsedReferenceV2 = z.infer<typeof ExternalReferenceV2Schema>;
export type ExternalReference =
  Omit<ParsedReference, 'prefix'> & Partial<Omit<ParsedReferenceV2, 'prefix' | 'perfilId' | 'mes' | 'anio' | 'esReconexion'>>;

export function parseExternalReference(value: string | null | undefined): ExternalReference | null {
  if (!value) return null;
  const parts = value.split('|');
  if (parts.length === 8) {
    const [prefix, perfilId, mes, anio, mesesAdelantados, esReconexion, montoMensual, montoReconexion] = parts;
    const result = ExternalReferenceV2Schema.safeParse({
      prefix, perfilId, mes, anio, mesesAdelantados, esReconexion, montoMensual, montoReconexion,
    });
    if (!result.success) return null;
    const data = result.data;
    const montoBaseTotal = Number(data.montoMensual) * data.mesesAdelantados + (data.esReconexion ? Number(data.montoReconexion) : 0);
    return {
      perfilId:           data.perfilId,
      mes:                data.mes,
      anio:               data.anio,
      esReconexion:       data.esReconexion,
      monto:              montoBaseTotal.toFixed(2),
      mesesAdelantados:   data.mesesAdelantados,
      montoMensual:       data.montoMensual,
      montoReconexion:    data.montoReconexion,
    };
  }
  if (parts.length !== 6) return null;
  const [prefix, perfilId, mes, anio, esReconexion, monto] = parts;
  const result = ExternalReferenceSchema.safeParse({ prefix, perfilId, mes, anio, esReconexion, monto });
  if (!result.success) return null;
  return {
    perfilId:     result.data.perfilId,
    mes:          result.data.mes,
    anio:         result.data.anio,
    esReconexion: result.data.esReconexion,
    monto:        result.data.monto,
  };
}

export function expandExternalReference(reference: ExternalReference): ExternalReference[] {
  const meses = reference.mesesAdelantados ?? 1;
  if (meses <= 1 || !reference.montoMensual) return [reference];

  return Array.from({ length: meses }, (_, index) => {
    const totalMeses = reference.mes - 1 + index;
    const mes = (totalMeses % 12) + 1;
    const anio = reference.anio + Math.floor(totalMeses / 12);
    const esReconexion = index === 0 && reference.esReconexion;
    const monto = Number(reference.montoMensual) + (esReconexion ? Number(reference.montoReconexion ?? 0) : 0);

    return {
      perfilId: reference.perfilId,
      mes,
      anio,
      esReconexion,
      monto: monto.toFixed(2),
    };
  });
}
