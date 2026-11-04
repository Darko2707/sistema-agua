import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nanoid } from 'nanoid';
import { eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { auditoria, cargosServicios, fraccionamientos, fraccionamientoServicios, perfilesResidente, servicios, user } from '@/db/schema';
import { donativosRouter } from '@/server/routers/donativos';

const suffix = nanoid(8);
const actorId = `donativo-admin-${suffix}`;
const tenantA = { id: '', nombre: `Donativo A ${suffix}` };
const tenantB = { id: '', nombre: `Donativo B ${suffix}` };
const homeIds: string[] = [];
const userIds = [actorId, `donativo-a-${suffix}`, `donativo-b-${suffix}`];
let servicioId = '';
let servicioCreadoPorTest = false;
const ctx = {
  user: {
    id: actorId,
    name: 'Admin de prueba',
    email: `donativo-admin-${suffix}@integration-test.local`,
    role: 'admin' as const,
    fraccionamientoId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  headers: new Headers(),
};

describe('donativos por fraccionamiento', () => {
  beforeAll(async () => {
    const existingService = await db.query.servicios.findFirst({ where: (service, { eq }) => eq(service.clave, 'donativo') });
    if (existingService) {
      servicioId = existingService.id;
    } else {
      const [createdService] = await db.insert(servicios).values({
        clave: 'donativo', nombre: 'Donativo', cobroMensual: false, conCorteFisico: false, activo: true,
      }).returning({ id: servicios.id });
      servicioId = createdService.id;
      servicioCreadoPorTest = true;
    }
    await db.insert(user).values([
      { id: actorId, name: 'Admin de prueba', email: ctx.user.email, role: 'representante' },
      { id: userIds[1], name: 'Residente A', email: `residente-a-${suffix}@integration-test.local`, role: 'residente' },
      { id: userIds[2], name: 'Residente B', email: `residente-b-${suffix}@integration-test.local`, role: 'residente' },
    ]);
    const [a] = await db.insert(fraccionamientos).values({
      nombre: tenantA.nombre, slug: `donativo-a-${suffix}`, montoMensual: '50.00', montoReconexion: '300.00', activo: true,
    }).returning({ id: fraccionamientos.id });
    const [b] = await db.insert(fraccionamientos).values({
      nombre: tenantB.nombre, slug: `donativo-b-${suffix}`, montoMensual: '50.00', montoReconexion: '300.00', activo: true,
    }).returning({ id: fraccionamientos.id });
    tenantA.id = a.id;
    tenantB.id = b.id;
    await db.update(user).set({ fraccionamientoId: tenantA.id }).where(eq(user.id, userIds[1]));
    await db.update(user).set({ fraccionamientoId: tenantB.id }).where(eq(user.id, userIds[2]));

    const [homeA] = await db.insert(perfilesResidente).values({
      userId: userIds[1], fraccionamientoId: tenantA.id, telefono: '5500000001', sexo: 'otro', tenencia: 'propietario',
      edificio: '999998', departamento: '1',
    }).returning({ id: perfilesResidente.id });
    const [homeB] = await db.insert(perfilesResidente).values({
      userId: userIds[2], fraccionamientoId: tenantB.id, telefono: '5500000002', sexo: 'otro', tenencia: 'propietario',
      edificio: '999999', departamento: '1',
    }).returning({ id: perfilesResidente.id });
    homeIds.push(homeA.id, homeB.id);
  });

  afterAll(async () => {
    if (homeIds.length) await db.delete(cargosServicios).where(inArray(cargosServicios.perfilId, homeIds));
    if (tenantA.id || tenantB.id) {
      const tenantIds = [tenantA.id, tenantB.id].filter(Boolean);
      if (tenantIds.length) {
        await db.delete(auditoria).where(eq(auditoria.actorId, actorId));
        await db.delete(fraccionamientoServicios).where(inArray(fraccionamientoServicios.fraccionamientoId, tenantIds));
        await db.delete(perfilesResidente).where(inArray(perfilesResidente.fraccionamientoId, tenantIds));
        await db.update(user).set({ fraccionamientoId: null }).where(inArray(user.id, userIds));
        await db.delete(fraccionamientos).where(inArray(fraccionamientos.id, tenantIds));
      }
    }
    if (servicioCreadoPorTest) await db.delete(servicios).where(eq(servicios.id, servicioId));
    await db.delete(user).where(inArray(user.id, userIds));
  });

  it('previsualiza solo viviendas del circuito/fraccionamiento seleccionado', async () => {
    const preview = await donativosRouter.createCaller(ctx).previsualizar({
      fraccionamientoId: tenantA.id, monto: 75, periodos: [{ mes: 4, anio: 2091 }],
    });
    expect(preview.viviendas.map(home => home.perfilId)).toEqual([homeIds[0]]);
    expect(preview.importeTotal).toBe('75.00');
  });

  it('genera cada periodo solicitado y bloquea duplicados sin crear cargos parciales', async () => {
    const caller = donativosRouter.createCaller(ctx);
    const input = {
      fraccionamientoId: tenantA.id,
      monto: 125.5,
      periodos: [{ mes: 4, anio: 2091 }, { mes: 5, anio: 2091 }],
    };
    const result = await caller.generar(input);
    expect(result).toMatchObject({ generados: 2, viviendas: 1, importeTotal: '251.00' });

    await expect(caller.generar({
      ...input,
      periodos: [{ mes: 5, anio: 2091 }, { mes: 6, anio: 2091 }],
    })).rejects.toMatchObject({ code: 'CONFLICT' });

    const rows = await db.select({ mes: cargosServicios.mes, anio: cargosServicios.anio, monto: cargosServicios.monto })
      .from(cargosServicios).where(eq(cargosServicios.perfilId, homeIds[0]));
    expect(rows.map(row => row.mes).sort()).toEqual([4, 5]);
    expect(rows.every(row => row.anio === 2091 && row.monto === '125.50')).toBe(true);
  });

  it('rechaza importes inválidos antes de escribir cargos', async () => {
    await expect(donativosRouter.createCaller(ctx).generar({
      fraccionamientoId: tenantA.id, monto: 0, periodos: [{ mes: 7, anio: 2091 }],
    })).rejects.toBeDefined();
    const rows = await db.select({ id: cargosServicios.id }).from(cargosServicios).where(eq(cargosServicios.perfilId, homeIds[0]));
    expect(rows).toHaveLength(2);
  });
});
