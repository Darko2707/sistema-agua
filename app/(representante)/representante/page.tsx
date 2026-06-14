'use client'

import { useState, useEffect } from 'react'
import { authClient, useSession } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const MESES = ['Ene','Feb','Mar','Abr','May','Jun',
               'Jul','Ago','Sep','Oct','Nov','Dic']
const ahora = new Date()

type Residente = {
  id: string
  edificio: string
  departamento: string
  estadoAgua: string
  usuario: { name: string; email: string }
}

type Resumen = {
  totalDeptos: number
  pagados: number
  recaudado: number
  porCircuito: { nombre: string; total: number; pagados: number }[]
}

function trpcQueryUrl(path: string) {
  return `/api/trpc/${path}?batch=1&input=` +
    encodeURIComponent(JSON.stringify({ '0': { json: undefined } }))
}

export default function RepresentantePage() {
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [residentes, setResidentes] = useState<Residente[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      const [resR, resL] = await Promise.all([
        fetch(trpcQueryUrl('pagos.resumenMes')),
        fetch(trpcQueryUrl('usuarios.listarResidentes')),
      ])
      if (resR.ok) setResumen((await resR.json())?.[0]?.result?.data ?? null)
      if (resL.ok) setResidentes((await resL.json())?.[0]?.result?.data ?? [])
      setCargando(false)
    }
    cargar()
  }, [])

  if (isPending || cargando) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Cargando...</p>
    </div>
  )

  const morosos = resumen ? resumen.totalDeptos - resumen.pagados : 0
  const porcentaje = resumen && resumen.totalDeptos > 0
    ? Math.round((resumen.pagados / resumen.totalDeptos) * 100)
    : 0

  return (
    <div className="min-h-screen bg-muted/40 p-4">
      <div className="mx-auto max-w-2xl space-y-4">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Mi circuito</h1>
            <p className="text-sm text-muted-foreground">
              {MESES[ahora.getMonth()]} {ahora.getFullYear()} · {session?.user?.name}
            </p>
          </div>
          <Button variant="ghost" size="sm"
            onClick={async () => { await authClient.signOut(); router.push('/login') }}>
            Salir
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold text-green-600">{resumen?.pagados ?? 0}</p>
              <p className="text-xs text-muted-foreground">Pagados</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold text-destructive">{morosos}</p>
              <p className="text-xs text-muted-foreground">Morosos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">{porcentaje}%</p>
              <p className="text-xs text-muted-foreground">Cobranza</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-4">
            <div className="flex justify-between text-sm mb-2">
              <span>Avance de cobranza</span>
              <span className="font-medium">{resumen?.pagados ?? 0}/{resumen?.totalDeptos ?? 0}</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${porcentaje}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Residentes de mi circuito</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {residentes.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Sin residentes registrados aún
              </p>
            )}
            {residentes.map(r => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{r.usuario.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.edificio} · {r.departamento}
                  </p>
                </div>
                <Badge variant={r.estadoAgua === 'activo' ? 'default' : 'destructive'}>
                  {r.estadoAgua === 'activo' ? 'Al corriente' : 'Cortado'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}