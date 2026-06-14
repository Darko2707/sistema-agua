'use client'

import { useState, useEffect } from 'react'
import { authClient, useSession } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

type Pago = {
  id: string
  mes: number
  anio: number
  estado: string
  folio: string | null
  monto: string
  esReconexion: boolean | null
}

export default function ResidentePage() {
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const [datos, setDatos] = useState<{ perfil: any; pagos: Pago[]; corteActivo: boolean } | null>(null)
  const [cargando, setCargando] = useState(true)
  const [pagando, setPagando] = useState(false)
  const [exito, setExito] = useState<{ folio: string; monto: string } | null>(null)
  const [error, setError] = useState('')

  const ahora = new Date()
  const mesActual  = ahora.getMonth() + 1
  const anioActual = ahora.getFullYear()

  async function cargarDatos() {
    const res = await fetch('/api/trpc/pagos.miHistorial?batch=1&input=' +
      encodeURIComponent(JSON.stringify({ '0': { json: undefined } })))
    if (res.ok) {
      const json = await res.json()
      setDatos(json?.[0]?.result?.data ?? null)
    }
    setCargando(false)
  }

  useEffect(() => { cargarDatos() }, [])

  const yaPagoEsteMes = datos?.pagos.some(
    p => p.mes === mesActual && p.anio === anioActual && p.estado === 'pagado'
  )

  const montoAPagar = datos?.corteActivo ? '350.00' : '50.00'

  async function handlePagar() {
    setPagando(true)
    setError('')

    const res = await fetch('/api/trpc/pagos.pagar?batch=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ '0': { json: { metodo: 'transferencia' } } }),
    })

    const json = await res.json()

    if (!res.ok) {
      const msg = json?.[0]?.error?.json?.message ?? 'No se pudo procesar el pago'
      setError(msg)
      setPagando(false)
      return
    }

    const data = json?.[0]?.result?.data
    setExito({ folio: data.folio, monto: data.monto })
    setPagando(false)
    await cargarDatos()
  }

  if (isPending || cargando) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Cargando...</p>
    </div>
  )

  if (!datos?.perfil) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="pt-6 space-y-3">
            <p className="text-sm">No encontramos tu perfil de residente.</p>
            <Button onClick={() => router.push('/registro')}>Completar registro</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/40 p-4">
      <div className="mx-auto max-w-lg space-y-4">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Mi cuenta de agua</h1>
            <p className="text-sm text-muted-foreground">
              {session?.user?.name} · {datos.perfil.edificio}, {datos.perfil.departamento}
            </p>
          </div>
          <Button variant="ghost" size="sm"
            onClick={async () => { await authClient.signOut(); router.push('/login') }}>
            Salir
          </Button>
        </div>

        {datos.corteActivo && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
            <p className="text-sm font-medium text-red-800">⚠ Tu servicio está cortado</p>
            <p className="text-xs text-red-600 mt-1">
              Paga $50 (mensualidad) + $300 (reconexión) = $350 para restablecer el servicio
            </p>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {MESES[mesActual - 1]} {anioActual}
            </CardTitle>
            <CardDescription>Mes actual</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Estado del pago</span>
              <Badge variant={yaPagoEsteMes ? 'default' : 'destructive'}>
                {yaPagoEsteMes ? 'Pagado' : 'Pendiente'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Monto a pagar</span>
              <span className="font-semibold">${montoAPagar} MXN</span>
            </div>

            {!yaPagoEsteMes && !exito && (
              <Button className="w-full" onClick={handlePagar} disabled={pagando}>
                {pagando ? 'Procesando...' : `Pagar $${montoAPagar}`}
              </Button>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            {exito && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
                <p className="text-sm font-medium text-green-800">¡Pago registrado!</p>
                <p className="text-xs text-green-600 mt-1">Folio: {exito.folio}</p>
                <p className="text-xs text-green-600">Monto: ${exito.monto} MXN</p>
                <p className="text-xs text-green-600">Recibirás tu comprobante por correo</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                <span className="text-xl">💧</span>
              </div>
              <div>
                <p className="text-sm font-medium">Servicio de agua</p>
                <p className={`text-xs font-medium ${datos.corteActivo ? 'text-destructive' : 'text-green-600'}`}>
                  {datos.corteActivo ? 'Cortado' : 'Activo'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historial de pagos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {datos.pagos.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Sin pagos registrados
                </p>
              )}
              {datos.pagos.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{MESES[p.mes - 1]} {p.anio}</p>
                    {p.folio && <p className="text-xs text-muted-foreground">{p.folio}</p>}
                    {p.esReconexion && (
                      <p className="text-xs text-amber-600">Incluye reconexión</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">${p.monto}</span>
                    <Badge variant={p.estado === 'pagado' ? 'default' : 'destructive'}>
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
  )
}