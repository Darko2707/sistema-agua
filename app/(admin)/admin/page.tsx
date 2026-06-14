'use client'

import { useEffect, useState } from 'react'
import { authClient, useSession } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import {
  Users,
  Wallet,
  Building2,
  AlertTriangle,
  LogOut,
  Shield,
} from 'lucide-react'

const MESES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
]

const ahora = new Date()

type Resumen = {
  totalDeptos: number
  pagados: number
  recaudado: number
  porCircuito: {
    nombre: string
    total: number
    pagados: number
  }[]
}

type Personal = {
  id: string
  name: string
  email: string
  role: string
}

const ROLES = [
  {
    value: 'admin',
    label: 'Administrador',
  },
  {
    value: 'representante',
    label: 'Representante',
  },
  {
    value: 'operador_pozo',
    label: 'Operador de pozo',
  },
  {
    value: 'cuadrilla_cortes',
    label: 'Cuadrilla',
  },
  {
    value: 'residente',
    label: 'Residente',
  },
]

function trpcQueryUrl(path: string) {
  return (
    `/api/trpc/${path}?batch=1&input=` +
    encodeURIComponent(
      JSON.stringify({
        '0': {
          json: undefined,
        },
      }),
    )
  )
}

export default function AdminPage() {
  const router = useRouter()

  const {
    data: session,
    isPending,
  } = useSession()

  const [tab, setTab] = useState<
    'resumen' | 'personal'
  >('resumen')

  const [resumen, setResumen] =
    useState<Resumen | null>(null)

  const [personal, setPersonal] =
    useState<Personal[]>([])

  const [cargando, setCargando] =
    useState(true)

  const [
    actualizando,
    setActualizando,
  ] = useState<string | null>(null)

  async function cargarDatos() {
    const [resR, resP] =
      await Promise.all([
        fetch(
          trpcQueryUrl(
            'pagos.resumenMes',
          ),
        ),
        fetch(
          trpcQueryUrl(
            'usuarios.listarPersonal',
          ),
        ),
      ])

    if (resR.ok) {
      setResumen(
        (await resR.json())?.[0]
          ?.result?.data ?? null,
      )
    }

    if (resP.ok) {
      setPersonal(
        (await resP.json())?.[0]
          ?.result?.data ?? [],
      )
    }

    setCargando(false)
  }

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cambiarRol(
    userId: string,
    rol: string,
  ) {
    setActualizando(userId)

    await fetch(
      '/api/trpc/usuarios.cambiarRol?batch=1',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
        },
        body: JSON.stringify({
          '0': {
            json: {
              userId,
              rol,
            },
          },
        }),
      },
    )

    await cargarDatos()

    setActualizando(null)
  }

  async function salir() {
    await authClient.signOut()
    router.push('/login')
  }

  if (isPending || cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Cargando...</p>
      </div>
    )
  }

  const morosos = resumen
    ? resumen.totalDeptos -
      resumen.pagados
    : 0

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="rounded-3xl bg-gradient-to-r from-sky-600 to-cyan-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold">
                Panel Administrador
              </h1>

              <p className="mt-2 text-sky-100">
                {
                  MESES[
                    ahora.getMonth()
                  ]
                }{' '}
                {ahora.getFullYear()} ·{' '}
                {
                  session?.user
                    ?.name
                }
              </p>
            </div>

            <Button
              variant="secondary"
              onClick={salir}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Salir
            </Button>
          </div>
        </div>

        {/* Estadísticas */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">
                  Pagos
                </p>

                <p className="text-3xl font-bold text-green-600">
                  {resumen?.pagados ??
                    0}
                </p>
              </div>

              <Wallet className="h-8 w-8 text-green-600" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">
                  Morosos
                </p>

                <p className="text-3xl font-bold text-red-600">
                  {morosos}
                </p>
              </div>

              <AlertTriangle className="h-8 w-8 text-red-600" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">
                  Departamentos
                </p>

                <p className="text-3xl font-bold">
                  {resumen?.totalDeptos ??
                    0}
                </p>
              </div>

              <Building2 className="h-8 w-8 text-primary" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">
                  Recaudado
                </p>

                <p className="text-3xl font-bold">
                  $
                  {(
                    resumen?.recaudado ??
                    0
                  ).toLocaleString()}
                </p>
              </div>

              <Users className="h-8 w-8 text-primary" />
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={
              tab === 'resumen'
                ? 'default'
                : 'outline'
            }
            onClick={() =>
              setTab(
                'resumen',
              )
            }
          >
            Resumen
          </Button>

          <Button
            variant={
              tab === 'personal'
                ? 'default'
                : 'outline'
            }
            onClick={() =>
              setTab(
                'personal',
              )
            }
          >
            Personal
          </Button>
        </div>

        {/* Resumen */}
        {tab === 'resumen' && (
          <Card>
            <CardHeader>
              <CardTitle>
                Estado por circuito
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-5">
              {(
                resumen?.porCircuito ??
                []
              ).map((c) => {
                const pct =
                  c.total > 0
                    ? Math.round(
                        (c.pagados /
                          c.total) *
                          100,
                      )
                    : 0

                return (
                  <div
                    key={
                      c.nombre
                    }
                    className="space-y-2"
                  >
                    <div className="flex justify-between">
                      <span className="font-medium">
                        {
                          c.nombre
                        }
                      </span>

                      <span className="text-muted-foreground">
                        {
                          c.pagados
                        }
                        /
                        {
                          c.total
                        }
                      </span>
                    </div>

                    <div className="h-3 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all"
                        style={{
                          width: `${pct}%`,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {/* Personal */}
        {tab === 'personal' && (
          <Card>
            <CardHeader>
              <CardTitle>
                Personal del sistema
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {personal.length ===
                0 && (
                <p className="py-10 text-center text-muted-foreground">
                  Sin personal
                  registrado.
                </p>
              )}

              {personal.map(
                (p) => (
                  <div
                    key={p.id}
                    className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />

                        <p className="font-medium">
                          {
                            p.name
                          }
                        </p>
                      </div>

                      <p className="text-sm text-muted-foreground">
                        {
                          p.email
                        }
                      </p>
                    </div>

                    <select
                      value={
                        p.role
                      }
                      disabled={
                        actualizando ===
                        p.id
                      }
                      onChange={(
                        e,
                      ) =>
                        cambiarRol(
                          p.id,
                          e.target
                            .value,
                        )
                      }
                      className="h-10 rounded-lg border bg-background px-3 md:w-72"
                    >
                      {ROLES.map(
                        (
                          r,
                        ) => (
                          <option
                            key={
                              r.value
                            }
                            value={
                              r.value
                            }
                          >
                            {
                              r.label
                            }
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                ),
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
