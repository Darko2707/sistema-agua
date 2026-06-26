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

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type Resumen = {
  totalDeptos: number;
  pagados:     number;
  recaudado:   number;
  porCircuito: { nombre: string; total: number; pagados: number }[];
};

export type Personal = {
  id:    string;
  name:  string;
  email: string;
  role:  string;
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
  circuito?:            { id: string; nombre: string } | null;
};

export type PaginaMeta = { total: number; page: number; pageSize: number; totalPages: number };

export type Circuito = {
  id:               string;
  nombre:           string;
  representanteId:  string | null;
};

export type AdminTab = 'resumen' | 'métricas' | 'personal' | 'residentes' | 'pendientes';

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAdmin() {
  const router = useRouter();

  const [tab, setTab]                           = useState<AdminTab>('resumen');
  const [resumen, setResumen]                   = useState<Resumen | null>(null);
  const [personal, setPersonal]                 = useState<Personal[]>([]);
  const [residentes, setResidentes]             = useState<ResidenteCompleto[]>([]);
  const [paginaMeta, setPaginaMeta]             = useState<PaginaMeta>({ total: 0, page: 1, pageSize: 50, totalPages: 0 });
  const [circuitos, setCircuitos]               = useState<Circuito[]>([]);
  const [pendientesCorte, setPendientesCorte]   = useState<ResidenteCompleto[]>([]);
  const [pendientesReconexion, setPendientesReconexion] = useState<ResidenteCompleto[]>([]);
  const [cargando, setCargando]                 = useState(true);
  const [actualizando, setActualizando]         = useState<string | null>(null);
  const [filtroCircuito, setFiltroCircuito]     = useState('todos');
  const [filtroEstado, setFiltroEstado]         = useState('todos');
  const [error, setError]                       = useState<string | null>(null);

  async function cargarDatos() {
    try {
      const [resumenData, personalData, residentesData, circuitosData, cortesData, reconexionesData] = await Promise.all([
        trpc.pagos.resumenMes.query(),
        trpc.usuarios.listarPersonal.query(),
        trpc.usuarios.listarResidentes.query({ page: 1, pageSize: 50 }),
        trpc.usuarios.listarCircuitos.query(),
        trpc.cortes.pendientesDeCorte.query(),
        trpc.cortes.pendientesDeReconexion.query(),
      ]);
      setResumen(resumenData as Resumen ?? null);
      setPersonal(personalData as Personal[]);
      const rd = residentesData as { items: ResidenteCompleto[]; total: number; page: number; pageSize: number; totalPages: number };
      setResidentes(rd.items);
      setPaginaMeta({ total: rd.total, page: rd.page, pageSize: rd.pageSize, totalPages: rd.totalPages });
      setCircuitos(circuitosData as Circuito[]);
      setPendientesCorte(cortesData as ResidenteCompleto[]);
      setPendientesReconexion(reconexionesData as ResidenteCompleto[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargarDatos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cambiarRol(userId: string, rol: string) {
    setActualizando(userId);
    setError(null);
    try {
      await trpc.usuarios.cambiarRol.mutate({
        userId,
        rol: rol as 'admin' | 'representante' | 'tesorera' | 'cuadrilla_cortes' | 'residente',
      });
      await cargarDatos();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cambiar rol');
    }
    setActualizando(null);
  }

  async function asignarRepresentante(circuitoId: string, userId: string) {
    if (!userId) return;
    setActualizando(circuitoId);
    setError(null);
    try {
      await trpc.usuarios.asignarRepresentante.mutate({ circuitoId, userId });
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
    const porCircuito = filtroCircuito === 'todos' || r.circuito?.id === filtroCircuito;
    const porEstado   = filtroEstado   === 'todos' || r.estadoAgua   === filtroEstado;
    return porCircuito && porEstado;
  });

  const morosos = resumen ? resumen.totalDeptos - resumen.pagados : 0;

  return {
    tab, setTab,
    resumen,
    personal,
    circuitos,
    pendientesCorte,
    pendientesReconexion,
    cargando,
    actualizando,
    filtroCircuito, setFiltroCircuito,
    filtroEstado,   setFiltroEstado,
    error,
    residentesFiltrados,
    morosos,
    paginaMeta,
    cargarDatos,
    cambiarRol,
    asignarRepresentante,
    registrarPagoRetroactivo,
    salir,
  };
}
