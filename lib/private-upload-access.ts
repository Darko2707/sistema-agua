import { and, eq, or } from 'drizzle-orm';
import { db } from '@/db';
import {
  asignacionesFraccionamiento,
  bitacoraCortes,
  comprobantesTransferencia,
  fraccionamientos,
  fraccionamientoServicios,
  perfilesResidente,
  servicios,
  user,
} from '@/db/schema';
import { buildComprobanteViewUrl } from '@/lib/comprobante-file';

const ALLOWED_UPLOAD_REFERENCE = /^uploads\/([^/]+)\/([a-f0-9-]{36})\.(pdf|jpg|jpeg|png|webp)$/i;

type UploadAccessUser = { id: string; role: string; fraccionamientoId: string | null };

async function canAccessTenant(viewer: UploadAccessUser, tenantId: string, ownerId: string): Promise<boolean> {
  if (viewer.id === ownerId || viewer.role === 'admin') return true;
  if (viewer.fraccionamientoId !== tenantId) return false;

  if (viewer.role === 'representante') {
    const [tenant] = await db.select({ id: fraccionamientos.id }).from(fraccionamientos).where(and(
      eq(fraccionamientos.id, tenantId), eq(fraccionamientos.representanteId, viewer.id), eq(fraccionamientos.activo, true),
    )).limit(1);
    return Boolean(tenant);
  }
  if (viewer.role === 'tesorera') {
    const [tenant] = await db.select({ id: fraccionamientos.id }).from(fraccionamientos).where(and(
      eq(fraccionamientos.id, tenantId), eq(fraccionamientos.tesoreraId, viewer.id), eq(fraccionamientos.activo, true),
    )).limit(1);
    return Boolean(tenant);
  }
  if (viewer.role === 'cuadrilla_cortes') {
    const [assignment] = await db.select({ id: asignacionesFraccionamiento.id })
      .from(asignacionesFraccionamiento)
      .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, asignacionesFraccionamiento.fraccionamientoServicioId))
      .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
      .where(and(
        eq(asignacionesFraccionamiento.usuarioId, viewer.id),
        eq(asignacionesFraccionamiento.fraccionamientoId, tenantId),
        eq(asignacionesFraccionamiento.rol, 'cuadrilla_cortes'),
        eq(asignacionesFraccionamiento.activo, true),
        eq(fraccionamientoServicios.fraccionamientoId, tenantId),
        eq(fraccionamientoServicios.estado, 'activo'),
        eq(servicios.clave, 'agua'),
      )).limit(1);
    return Boolean(assignment);
  }
  return false;
}

/** Authorizes private legacy uploads only when owned by the requester or linked to an accessible tenant record. */
export async function canReadPrivateUpload(userId: string, reference: string): Promise<boolean> {
  const match = ALLOWED_UPLOAD_REFERENCE.exec(reference);
  if (!match) return false;
  const ownerId = match[1]!;
  const viewUrl = buildComprobanteViewUrl(reference);
  const [viewer] = await db.select({ id: user.id, role: user.role, fraccionamientoId: user.fraccionamientoId })
    .from(user).where(eq(user.id, userId)).limit(1);
  if (!viewer) return false;
  if (viewer.id === ownerId) return true;
  if (viewer.role === 'admin') return true;

  const receipts = await db.select({
    ownerId: perfilesResidente.userId,
    tenantId: comprobantesTransferencia.fraccionamientoId,
  }).from(comprobantesTransferencia)
    .innerJoin(perfilesResidente, eq(perfilesResidente.id, comprobantesTransferencia.perfilId))
    .where(or(
      eq(comprobantesTransferencia.comprobanteUrl, reference),
      eq(comprobantesTransferencia.comprobanteUrl, viewUrl),
    ));
  for (const receipt of receipts) {
    if (receipt.ownerId === viewer.id || await canAccessTenant(viewer, receipt.tenantId, receipt.ownerId)) return true;
  }

  const photos = await db.select({
    ownerId: bitacoraCortes.actorId,
    tenantId: perfilesResidente.fraccionamientoId,
  }).from(bitacoraCortes)
    .innerJoin(perfilesResidente, eq(perfilesResidente.id, bitacoraCortes.perfilId))
    .where(or(eq(bitacoraCortes.fotoUrl, reference), eq(bitacoraCortes.fotoUrl, viewUrl)));
  for (const photo of photos) {
    if (photo.ownerId === viewer.id || (photo.tenantId && await canAccessTenant(viewer, photo.tenantId, photo.ownerId ?? ''))) return true;
  }

  return false;
}

