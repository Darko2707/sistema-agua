'use client'

import { useEffect, useState } from 'react'
import { authClient, useSession } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc-client'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

import {
  Droplets,
  CreditCard,
  LogOut,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

type Pago = {
  id: string
  mes: number
  anio: number
  estado: string | null
  folio: string | null
  monto: string
  esReconexion: boolean | null
}

export default function ResidentePage() {
  const router = useRouter()

  const {
    data: session,
    isPending,
  } = useSession()

  const [datos, setDatos] = useState<{
    perfil: any
    pagos: Pago[]
    corteActivo: boolean
  } | null>(null)

  const [cargando, setCargando] = useState(true)

  const [pagando, setPagando] = useState(false)

  const [exito, setExito] = useState<{
    folio: string
    monto: string
  } | null>(null)

  const [error, setError] = useState('')

  const ahora = new Date()
  const mesActual = ahora.getMonth() + 1
  const anioActual = ahora.getFullYear()

  async function cargarDatos() {
    try {
      const data = await trpc.pagos.miHistorial.query()
      setDatos(data)
    } catch (e) {
      console.error(e)
    }
    setCargando(false)
  }

  useEffect(() => {
    cargarDatos()
  }, [])

  async function salir() {
    await authClient.signOut()
    router.push('/login')
  }

  const yaPagoEsteMes = datos?.pagos.some(
    (p) => p.mes === mesActual && p.anio === anioActual && p.estado === 'pagado'
  )

  const montoAPagar = datos?.corteActivo ? '350.00' : '50.00'

  async function handlePagar() {
    setPagando(true)
    setError('')
    try {
      const data = await trpc.pagos.pagar.mutate({ metodo: 'transferencia' })
      setExito({ folio: data.folio, monto: data.monto })
      await cargarDatos()
    } catch (err: any) {
      setError(err.message ?? 'No se pudo procesar el pago')
    } finally {
      setPagando(false)
    }
  }

  if (isPending || cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  if (!datos?.perfil) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 pt-6 text-center">
            <p>No encontramos tu perfil de residente.</p>

            <Button onClick={() => router.push('/registro')}>
              Completar registro
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="rounded-3xl bg-gradient-to-r from-sky-600 to-cyan-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold">Mi Cuenta de Agua</h1>

              <p className="mt-2 text-sky-100">
                {session?.user?.name} · {datos.perfil.edificio},{' '}
                {datos.perfil.departamento}
              </p>
            </div>

            <Button variant="secondary" onClick={salir}>
              <LogOut className="mr-2 h-4 w-4" />
              Salir
            </Button>
          </div>
        </div>

        {datos.corteActivo && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-red-600" />

              <div>
                <p className="font-semibold text-red-700">
                  Tu servicio está suspendido
                </p>

                <p className="mt-1 text-sm text-red-600">
                  Debes pagar $350.00 MXN ($50 de mensualidad + $300 de
                  reconexión).
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Pago */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>
                {MESES[mesActual - 1]} {anioActual}
              </CardTitle>

              <CardDescription>Estado del mes actual</CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <span>Estado</span>

                <Badge variant={yaPagoEsteMes ? 'default' : 'destructive'}>
                  {yaPagoEsteMes ? 'Pagado' : 'Pendiente'}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span>Monto a pagar</span>

                <span className="text-2xl font-bold">${montoAPagar} MXN</span>
              </div>

              {!yaPagoEsteMes && !exito && (
                <Button
                  className="w-full h-12"
                  onClick={handlePagar}
                  disabled={pagando}
                >
                  <CreditCard className="mr-2 h-4 w-4" />

                  {pagando ? 'Procesando...' : `Pagar $${montoAPagar}`}
                </Button>
              )}

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              {exito && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-center">
                  <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-600" />

                  <p className="font-semibold text-green-700">
                    Pago registrado correctamente
                  </p>

                  <p className="mt-3 text-sm">
                    Folio: <span className="font-bold">{exito.folio}</span>
                  </p>

                  <p className="text-sm">
                    Monto: <span className="font-bold">${exito.monto} MXN</span>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Servicio */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                    datos.corteActivo ? 'bg-red-100' : 'bg-green-100'
                  }`}
                >
                  <Droplets
                    className={`h-7 w-7 ${
                      datos.corteActivo ? 'text-red-600' : 'text-green-600'
                    }`}
                  />
                </div>

                <div>
                  <p className="font-semibold">Servicio de agua</p>

                  <p
                    className={`text-sm ${
                      datos.corteActivo ? 'text-red-600' : 'text-green-600'
                    }`}
                  >
                    {datos.corteActivo ? 'Suspendido' : 'Activo'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Historial */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Historial de pagos</CardTitle>
            </CardHeader>

            <CardContent>
              <div className="space-y-3">
                {datos.pagos.length === 0 && (
                  <p className="py-10 text-center text-muted-foreground">
                    Sin pagos registrados.
                  </p>
                )}

                {datos.pagos.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {MESES[p.mes - 1]} {p.anio}
                      </p>

                      {p.folio && (
                        <p className="text-sm text-muted-foreground">
                          {p.folio}
                        </p>
                      )}

                      {p.esReconexion && (
                        <p className="text-sm text-amber-600">
                          Incluye reconexión
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-semibold">${p.monto}</span>

                      <Badge
                        variant={p.estado === 'pagado' ? 'default' : 'destructive'}
                      >
                        {p.estado}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}