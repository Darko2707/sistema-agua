'use client'

import { useState, useEffect } from 'react'
import { authClient, useSession } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type CorteActivo = {
  id: string
  motivo: string
  fechaCorte: string
  perfil: {
    edificio: string
    departamento: string
    circuito: { nombre: string }
    usuario: { name: string }
  }
}

function trpcQueryUrl(path: string) {
  return `/api/trpc/${path}?batch=1&input=` +
    encodeURIComponent(JSON.stringify({ '0': { json: undefined } }))
}

export default function TrabajadorPage() {
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const [activos, setActivos] = useState<CorteActivo[]>([])
  const [reconectados, setReconectados] = useState<CorteActivo[]>([])
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState<string | null>(null)

  async function cargarDatos() {
    const [resActivos, resReconectados] = await Promise.all([
      fetch(trpcQueryUrl('cortes.listarActivos')),
      fetch(trpcQueryUrl('cortes.reconectadosHoy')),
    ])

    if (resActivos.ok) {
      const json = await resActivos.json()
      setActivos(json?.[0]?.result?.data ?? [])
    }
    if (resReconectados.ok) {
      const json = await resReconectados.json()
      setReconectados(json?.[0]?.result?.data ?? [])
    }
    setCargando(false)
  }

  useEffect(() => { cargarDatos() }, [])

  async function handleReconectar(corteId: string) {
    setProcesando(corteId)

    await fetch('/api/trpc/cortes.confirmarReconexion?batch=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ '0': { json: { corteId } } }),
    })

    await cargarDatos()
    setProcesando(null)
  }

  if (isPending || cargando) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Cargando...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-muted/40 p-4">
      <div className="mx-auto max-w-2xl space-y-4">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Cuadrilla de cortes</h1>
            <p className="text-sm text-muted-foreground">{session?.user?.name}</p>
          </div>
          <Button variant="ghost" size="sm"
            onClick={async () => { await authClient.signOut(); router.push('/login') }}>
            Salir
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold text-destructive">{activos.length}</p>
              <p className="text-sm text-muted-foreground">Cortes activos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold text-green-600">{reconectados.length}</p>
              <p className="text-sm text-muted-foreground">Reconectados hoy</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cortes pendientes de reconexión</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activos.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Sin cortes pendientes ✓
              </p>
            )}
            {activos.map(c => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border p-3 gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.perfil.usuario.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.perfil.circuito.nombre} · {c.perfil.edificio} · {c.perfil.departamento}
                  </p>
                  <p className="text-xs text-muted-foreground">{c.motivo}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant="destructive">Cortado</Badge>
                  <Button size="sm" variant="outline"
                    disabled={procesando === c.id}
                    onClick={() => handleReconectar(c.id)}>
                    {procesando === c.id ? 'Procesando...' : 'Reconectar'}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {reconectados.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reconectados hoy — cobrar $300</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {reconectados.map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{c.perfil.usuario.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.perfil.circuito.nombre} · {c.perfil.edificio} · {c.perfil.departamento}
                    </p>
                  </div>
                  <Badge variant="default">Reconectado</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  )
}