'use client'

import { useState } from 'react'
import { authClient, useSession } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const pagosEjemplo = [
  { mes: 5, anio: 2025, estado: 'pagado',  folio: 'AGU-ABC123', monto: '50.00' },
  { mes: 4, anio: 2025, estado: 'pagado',  folio: 'AGU-DEF456', monto: '50.00' },
  { mes: 3, anio: 2025, estado: 'vencido', folio: null,         monto: '50.00' },
]

export default function ResidentePage() {
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const [pagando, setPagando] = useState(false)
  const [exito, setExito] = useState('')

  const ahora = new Date()
  const mesActual  = ahora.getMonth() + 1
  const anioActual = ahora.getFullYear()

  const yaPagoEsteMes = pagosEjemplo.some(
    p => p.mes === mesActual && p.anio === anioActual && p.estado === 'pagado'
  )

  async function handlePagar() {
    setPagando(true)
    await new Promise(r => setTimeout(r, 1500))
    setExito(`AGU-${Math.random().toString(36).slice(2,10).toUpperCase()}`)
    setPagando(false)
  }

  if (isPending) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Cargando...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-muted/40 p-4">
      <div className="mx-auto max-w-lg space-y-4">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Mi cuenta de agua</h1>
            <p className="text-sm text-muted-foreground">
              {session?.user?.name ?? 'Residente'}
            </p>
          </div>
          <Button variant="ghost" size="sm"
            onClick={async () => { await authClient.signOut(); router.push('/login') }}>
            Salir
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {MESES[mesActual - 1]} {anioActual}
            </CardTitle>
            <CardDescription>Mes actual</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Estado</span>
              <Badge variant={yaPagoEsteMes ? 'default' : 'destructive'}>
                {yaPagoEsteMes ? 'Pagado' : 'Pendiente'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Monto</span>
              <span className="font-semibold">$50.00 MXN</span>
            </div>

            {!yaPagoEsteMes && !exito && (
              <Button className="w-full" onClick={handlePagar} disabled={pagando}>
                {pagando ? 'Procesando...' : 'Pagar $50.00'}
              </Button>
            )}

            {exito && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
                <p className="text-sm font-medium text-green-800">¡Pago registrado!</p>
                <p className="text-xs text-green-600 mt-1">Folio: {exito}</p>
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
                <p className="text-xs text-green-600 font-medium">Activo</p>
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
              {pagosEjemplo.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{MESES[p.mes - 1]} {p.anio}</p>
                    {p.folio && <p className="text-xs text-muted-foreground">{p.folio}</p>}
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