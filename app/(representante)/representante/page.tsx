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
import { Badge } from '@/components/ui/badge'

import {
  LogOut,
  Users,
  AlertTriangle,
  TrendingUp,
  Droplets,
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

type Residente = {
  id: string
  edificio: string
  departamento: string
  estadoAgua: string
  usuario: {
    name: string
    email: string
  }
}

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

export default function RepresentantePage() {
  const router = useRouter()

  const {
    data: session,
    isPending,
  } = useSession()

  const [resumen, setResumen] =
    useState<Resumen | null>(null)

  const [residentes, setResidentes] =
    useState<Residente[]>([])

  const [cargando, setCargando] =
    useState(true)

  useEffect(() => {
    async function cargar() {
      const [resR, resL] =
        await Promise.all([
          fetch(
            trpcQueryUrl(
              'pagos.resumenMes',
            ),
          ),
          fetch(
            trpcQueryUrl(
              'usuarios.listarResidentes',
            ),
          ),
        ])

      if (resR.ok) {
        setResumen(
          (await resR.json())?.[0]
            ?.result?.data ?? null,
        )
      }

      if (resL.ok) {
        setResidentes(
          (await resL.json())?.[0]
            ?.result?.data ?? [],
        )
      }

      setCargando(false)
    }

    cargar()
  }, [])

  async function salir() {
    await authClient.signOut()
    router.push('/login')
  }

  if (isPending || cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">
          Cargando...
        </p>
      </div>
    )
  }

  const morosos = resumen
    ? resumen.totalDeptos -
      resumen.pagados
    : 0

  const porcentaje =
    resumen &&
    resumen.totalDeptos > 0
      ? Math.round(
          (resumen.pagados /
            resumen.totalDeptos) *
            100,
        )
      : 0

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="rounded-3xl bg-gradient-to-r from-sky-600 to-cyan-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold">
                Mi Circuito
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
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">
                  Pagados
                </p>

                <p className="text-3xl font-bold text-green-600">
                  {resumen?.pagados ??
                    0}
                </p>
              </div>

              <Users className="h-8 w-8 text-green-600" />
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
                  Cobranza
                </p>

                <p className="text-3xl font-bold text-primary">
                  {porcentaje}%
                </p>
              </div>

              <TrendingUp className="h-8 w-8 text-primary" />
            </CardContent>
          </Card>
        </div>

        {/* Barra */}
        <Card>
          <CardHeader>
            <CardTitle>
              Avance de cobranza
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="mb-3 flex justify-between text-sm">
              <span>
                Pagos recibidos
              </span>

              <span className="font-medium">
                {resumen?.pagados ??
                  0}
                /
                {resumen?.totalDeptos ??
                  0}
              </span>
            </div>

            <div className="h-4 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-500"
                style={{
                  width: `${porcentaje}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Residentes */}
        <Card>
          <CardHeader>
            <CardTitle>
              Residentes del circuito
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            {residentes.length ===
              0 && (
              <p className="py-10 text-center text-muted-foreground">
                No hay residentes
                registrados.
              </p>
            )}

            {residentes.map(
              (r) => (
                <div
                  key={r.id}
                  className="flex flex-col gap-4 rounded-xl border bg-background p-4 transition hover:shadow-sm md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100">
                      <Droplets className="h-6 w-6 text-sky-600" />
                    </div>

                    <div>
                      <p className="font-medium">
                        {
                          r.usuario
                            .name
                        }
                      </p>

                      <p className="text-sm text-muted-foreground">
                        {
                          r.edificio
                        }{' '}
                        ·{' '}
                        {
                          r.departamento
                        }
                      </p>

                      <p className="text-xs text-muted-foreground">
                        {
                          r.usuario
                            .email
                        }
                      </p>
                    </div>
                  </div>

                  <Badge
                    variant={
                      r.estadoAgua ===
                      'activo'
                        ? 'default'
                        : 'destructive'
                    }
                  >
                    {r.estadoAgua ===
                    'activo'
                      ? 'Al corriente'
                      : 'Cortado'}
                  </Badge>
                </div>
              ),
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}