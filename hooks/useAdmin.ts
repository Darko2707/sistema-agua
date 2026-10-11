import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc-client';

import { MESES_CORTO } from '@/lib/meses';

// Re-exported for backward compat with AdminDashboard
export const MESES = MESES_CORTO;

export const ROLES = [
  { value: 'admin',            label: 'Administrador' },
  { value: 'representante',    label: 'Representante' },
  { value: 'tesorera',         label: 'Tesorera/o' },
  { value: 'cuadrilla_cortes', label: 'Cuadrilla' },
  { value: 'residente',        label: 'Residente' },
];

export const ROLES_ASIGNABLES = ROLES.filter((role) => role.value !== 'admin');

// â”€â”€â”€ Tipos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type Resumen = {
  totalDeptos: number;
  pagados:     number;
  recaudado:   number;
  porFraccionamiento: { nombre: string; total: number; pagados: number }[];
};

export type Personal = {
  id:    string;
  name:  string;
  email: string;
  role:  string;
  fraccionamientoId?: string | null;
  fraccionamientoNombre?: string | null;
};

export type ResidenteCompleto = {
  id:                   string;
  edificio:             string;
  departamento:         string;
  estadoAgua:           string;
  tenencia?:            string | null;
  nombrePropietario?:   string | null;
  telefonoPropietario?: string | null;
  pagoEsteMes?:         boolean;
  esMoroso?:            boolean;
  corteActivo?:         boolean;
  usuario?:             { id?: string; name?: string; email?: string; role?: string } | null;
  fraccionamiento?:     { id: string; nombre: string; activo?: boolean } | null;
};

export type PaginaMeta = { total: number; page: number; pageSize: number; totalPages: number };

// Conservado para formularios administrativos que todavía se migrarán en
// tareas posteriores; el panel de residentes ya no lo usa.
export type Circuito = {
  id:               string;
  nombre:           string;
  representanteId:  string | null;
};

export type AdminTab = 'resumen' | 'métricas' | 'personal' | 'residentes' | 'pendientes' | 'operacion';

// â”€â”€â”€ Hook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function useAdmin() {
  const router = useRouter();

  const [tab, setTab]                           = useState<AdminTab>('resumen');
  const [resumen, setResumen]                   = useState<Resumen | null>(null);
  const [personal, setPersonal]                 = useState<Personal[]>([]);
  const [residentes, setResidentes]             = useState<ResidenteCompleto[]>([]);
  const [paginaMeta, setPaginaMeta]             = useState<PaginaMeta>({ total: 0, page: 1, pageSize: 50, totalPages: 0 });
  const [pendientesCorte, setPendientesCorte]   = useState<ResidenteCompleto[]>([]);
  const [pendientesReconexion, setPendientesReconexion] = useState<ResidenteCompleto[]>([]);
  const [cargando, setCargando]                 = useState(true);
  const [actualizando, setActualizando]         = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado]         = useState('todos');
  const [paginaResidentes, setPaginaResidentes] = useState(1);
  const [busquedaResidentes, setBusquedaResidentes] = useState('');
  const [error, setError]                       = useState<string | null>(null);

  async function cargarDatos(page = paginaResidentes) {
    try {
      const [resumenData, personalData, residentesData, cortesData, reconexionesData] = await Promise.all([
        trpc.pagos.resumenMes.query(),
        trpc.usuarios.listarPersonal.query(),
        trpc.usuarios.listarResidentes.query({ page, pageSize: 50 }),
        trpc.cortes.pendientesDeCorte.query(),
        trpc.cortes.pendientesDeReconexion.query(),
      ]);
      setResumen(resumenData as Resumen ?? null);
      setPersonal(personalData as Personal[]);
      const rd = residentesData as { items: ResidenteCompleto[]; total: number; page: number; pageSize: number; totalPages: number };
      setResidentes(rd.items);
      setPaginaMeta({ total: rd.total, page: rd.page, pageSize: rd.pageSize, totalPages: rd.totalPages });
      setPaginaResidentes(rd.page);
      setPendientesCorte(cortesData as ResidenteCompleto[]);
      setPendientesReconexion(reconexionesData as ResidenteCompleto[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    // Carga inicial de datos del panel admin; no hay estado externo que sincronizar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cambiarRol(userId: string, rol: string) {
    setActualizando(userId);
    setError(null);
    try {
      await trpc.usuarios.cambiarRol.mutate({
        userId,
        rol: rol as 'representante' | 'tesorera' | 'cuadrilla_cortes' | 'residente',
      });
      await cargarDatos();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cambiar rol');
    }
    setActualizando(null);
  }

  async function irPaginaResidentes(page: number) {
    if (page < 1 || (paginaMeta.totalPages > 0 && page > paginaMeta.totalPages)) return;
    setCargando(true);
    setError(null);
    try {
      await cargarDatos(page);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar residentes');
    } finally {
      setCargando(false);
    }
  }

  async function asignarRepresentante(fraccionamientoId: string, userId: string) {
    if (!userId) return;
    setActualizando(fraccionamientoId);
    setError(null);
    try {
      await trpc.usuarios.asignarRepresentante.mutate({ fraccionamientoId, userId });
      await cargarDatos();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al asignar representante');
    }
    setActualizando(null);
  }

  async function registrarPagoRetroactivo(
    perfilId: string,
    meses: Array<{ mes: number; anio: number }>,
    metodo: 'efectivo' | 'transferencia',
  ): Promise<{ registrados: number; omitidos: string[] }> {
    return trpc.pagos.registrarRetroactivo.mutate({ perfilId, meses, metodo });
  }

  async function salir() {
    await authClient.signOut();
    router.push('/login');
  }

  const residentesFiltrados = residentes.filter((r) => {
    const porEstado   = filtroEstado   === 'todos' || r.estadoAgua   === filtroEstado;
    const termino = busquedaResidentes.trim().toLowerCase();
    const texto = [r.usuario?.name, r.usuario?.email, r.edificio, r.departamento, r.fraccionamiento?.nombre]
      .filter(Boolean).join(' ').toLowerCase();
    return porEstado && (!termino || texto.includes(termino));
  });

  const morosos = resumen ? resumen.totalDeptos - resumen.pagados : 0;

  return {
    tab, setTab,
    resumen,
    personal,
    pendientesCorte,
    pendientesReconexion,
    cargando,
    actualizando,
    filtroEstado,   setFiltroEstado,
    error,
    residentesFiltrados,
    morosos,
    paginaMeta,
    paginaResidentes,
    irPaginaResidentes,
    busquedaResidentes, setBusquedaResidentes,
    cargarDatos,
    cambiarRol,
    asignarRepresentante,
    registrarPagoRetroactivo,
    salir,
  };
}


