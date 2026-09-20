import { z } from 'zod';

const telefono = z.string().regex(/^\d{10}$/, 'El telefono debe contener exactamente 10 digitos');

/** Campos que el residente puede proponer; el estado del agua nunca es editable. */
export const PerfilCambiosSchema = z.object({
  telefono:            telefono.optional(),
  sexo:                z.enum(['masculino', 'femenino', 'otro']).optional(),
  tenencia:            z.enum(['propietario', 'inquilino']).optional(),
  circuitoId:          z.string().uuid().optional(),
  edificio:            z.string().trim().regex(/^[1-9][0-9]{0,5}$/).optional(),
  departamento:        z.string().trim().regex(/^[1-9][0-9]{0,5}[A-Z]?$/).optional(),
  nombrePropietario:   z.string().trim().min(2).max(120).nullable().optional(),
  telefonoPropietario: telefono.nullable().optional(),
}).strict();

export type PerfilCambios = z.infer<typeof PerfilCambiosSchema>;
