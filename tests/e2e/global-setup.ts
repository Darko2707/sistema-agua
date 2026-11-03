import type { FullConfig } from '@playwright/test';
import { and, eq, inArray } from 'drizzle-orm';

/**
 * Seed isolated E2E identities before starting the application. Requiring a
 * dedicated URL prevents this setup from ever writing test records to the
 * developer or production database by accident.
 */
export default async function globalSetup(_config: FullConfig) {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('E2E_DATABASE_URL es obligatorio y debe apuntar a una base de datos aislada para ejecutar Playwright.');
  }

  process.env.DATABASE_URL = databaseUrl;
  const [{ db }, schema, { hashAccountPassword }] = await Promise.all([
    import('../../db'),
    import('../../db/schema'),
    import('../../lib/password'),
  ]);
  const tenantId = '00000000-0000-4000-8000-00000000e2e0';
  const password = process.env.E2E_TEST_PASSWORD ?? 'Sisco-E2E-2026!';
  const residentEmail = (process.env.E2E_RESIDENTE_EMAIL ?? 'residente@test.local').trim().toLowerCase();
  const credentials = [
    { email: residentEmail, role: 'residente' as const, name: 'Residente E2E' },
    { email: 'cuadrilla@test.local', role: 'cuadrilla_cortes' as const, name: 'Cuadrilla E2E' },
    { email: 'tesoreria@test.local', role: 'tesorera' as const, name: 'Tesorería E2E' },
    { email: 'admin@test.local', role: 'admin' as const, name: 'Admin E2E' },
  ];

  await db.insert(schema.fraccionamientos).values({
      id: tenantId,
      nombre: 'Fraccionamiento E2E',
      slug: 'sisco-e2e',
    }).onConflictDoNothing();

    const now = new Date();
    const vigenciaHasta = new Date(now);
    vigenciaHasta.setFullYear(vigenciaHasta.getFullYear() + 1);
    const [currentSubscription] = await db.select({ id: schema.suscripcionesFraccionamiento.id })
      .from(schema.suscripcionesFraccionamiento)
      .where(and(
        eq(schema.suscripcionesFraccionamiento.fraccionamientoId, tenantId),
        inArray(schema.suscripcionesFraccionamiento.estado, ['activa', 'gracia']),
      ))
      .limit(1);

    if (currentSubscription) {
      await db.update(schema.suscripcionesFraccionamiento)
        .set({ estado: 'activa', vigenciaDesde: now, vigenciaHasta, graciaHasta: null, actualizadoEn: now })
        .where(eq(schema.suscripcionesFraccionamiento.id, currentSubscription.id));
    } else {
      await db.insert(schema.suscripcionesFraccionamiento).values({
        fraccionamientoId: tenantId,
        plan: 'anual',
        estado: 'activa',
        vigenciaDesde: now,
        vigenciaHasta,
      });
    }

    const [waterService] = await db.insert(schema.servicios).values({
      clave: 'agua',
      nombre: 'Agua',
      activo: true,
      conCorteFisico: true,
    }).onConflictDoUpdate({
      target: schema.servicios.clave,
      set: { nombre: 'Agua', activo: true, conCorteFisico: true },
    }).returning({ id: schema.servicios.id });
    if (!waterService) throw new Error('No se pudo preparar el servicio global de agua para E2E.');

    const existingFraccService = await db.query.fraccionamientoServicios.findFirst({
      where: (service, { and, eq }) => and(
        eq(service.fraccionamientoId, tenantId),
        eq(service.servicioId, waterService.id),
      ),
    });

    let fraccionamientoServiceId: string;
    if (existingFraccService) {
      fraccionamientoServiceId = existingFraccService.id;
      await db.update(schema.fraccionamientoServicios)
        .set({ estado: 'activo', montoMensual: '100.00', montoReconexion: '300.00', actualizadoEn: new Date() })
        .where(eq(schema.fraccionamientoServicios.id, existingFraccService.id));
    } else {
      const [created] = await db.insert(schema.fraccionamientoServicios).values({
        fraccionamientoId: tenantId,
        servicioId: waterService.id,
        estado: 'activo',
        montoMensual: '100.00',
        montoReconexion: '300.00',
      }).returning({ id: schema.fraccionamientoServicios.id });
      if (!created) throw new Error('No se pudo activar el servicio de agua en el fraccionamiento E2E.');
      fraccionamientoServiceId = created.id;
    }

    const passwordHash = await hashAccountPassword(password);
    const users: Array<{ id: string; email: string; role: typeof credentials[number]['role'] }> = [];
    for (const fixture of credentials) {
      const id = `e2e-${fixture.role}`;
      const [created] = await db.insert(schema.user).values({
        id,
        name: fixture.name,
        email: fixture.email,
        emailVerified: true,
        role: fixture.role,
        fraccionamientoId: fixture.role === 'admin' ? null : tenantId,
        responsableCargos: fixture.role === 'residente',
      }).onConflictDoUpdate({
        target: schema.user.email,
        set: {
          name: fixture.name,
          role: fixture.role,
          fraccionamientoId: fixture.role === 'admin' ? null : tenantId,
          responsableCargos: fixture.role === 'residente',
          emailVerified: true,
          deletedAt: null,
          updatedAt: new Date(),
        },
      }).returning({ id: schema.user.id });
      const userId = created?.id ?? id;
      users.push({ id: userId, email: fixture.email, role: fixture.role });
      await db.insert(schema.account).values({
        id: `e2e-account-${fixture.role}`,
        accountId: userId,
        providerId: 'credential',
        userId,
        password: passwordHash,
      }).onConflictDoUpdate({
        target: schema.account.id,
        set: { accountId: userId, userId, password: passwordHash, updatedAt: new Date() },
      });
    }

    const resident = users.find(item => item.role === 'residente');
    if (!resident) throw new Error('No se pudo crear la cuenta residente E2E.');
    const [residentProfile] = await db.insert(schema.perfilesResidente).values({
      userId: resident.id,
      fraccionamientoId: tenantId,
      telefono: '5550000000',
      sexo: 'otro',
      tenencia: 'propietario',
      edificio: '999999',
      departamento: '999999',
      estadoAgua: 'activo',
    }).onConflictDoUpdate({
      target: schema.perfilesResidente.userId,
      set: {
        fraccionamientoId: tenantId,
        telefono: '5550000000',
        sexo: 'otro',
        tenencia: 'propietario',
        edificio: '999999',
        departamento: '999999',
        estadoAgua: 'activo',
      },
    }).returning({ id: schema.perfilesResidente.id });
    if (!residentProfile) throw new Error('No se pudo crear el perfil residencial E2E.');

    const existingProfileService = await db.query.perfilesServicios.findFirst({
      where: (profileService, { and, eq }) => and(
        eq(profileService.perfilId, residentProfile.id),
        eq(profileService.fraccionamientoServicioId, fraccionamientoServiceId),
      ),
    });
    if (existingProfileService) {
      await db.update(schema.perfilesServicios)
        .set({ fraccionamientoId: tenantId, estadoAgua: 'activo', activo: true, actualizadoEn: new Date() })
        .where(eq(schema.perfilesServicios.id, existingProfileService.id));
    } else {
      await db.insert(schema.perfilesServicios).values({
        perfilId: residentProfile.id,
        fraccionamientoId: tenantId,
        fraccionamientoServicioId: fraccionamientoServiceId,
        estadoAgua: 'activo',
        activo: true,
      });
    }

    await db.update(schema.user)
      .set({ fraccionamientoId: tenantId, updatedAt: new Date() })
      .where(eq(schema.user.id, resident.id));
}
