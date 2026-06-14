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

type Resumen = {
  totalDeptos: number
  pagados: number
  recaudado: number
  porCircuito: { nombre: string; total: number; pagados: number }[]
}

type Personal = {
  id: string
  name: string
  email: string
  role: string
}

const ROLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'representante', label: 'Representante de circuito' },
  { value: 'operador_pozo', label: 'Operador de pozo' },
  { value: 'cuadrilla_cortes', label: 'Cuadrilla de cortes' },
  { value: 'residente', label: 'Residente' },
]

function trpcQueryUrl(path: string) {
  return `/api/trpc/${path}?batch=1&input=` +
    encodeURIComponent(JSON.stringify({ '0': { json: undefined } }))
}

export default function AdminPage() {
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const [tab, setTab] = useState<'resumen' | 'personal'>('resumen')
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [personal, setPersonal] = useState<Personal[]>([])
  const [cargando, setCargando] = useState(true)
  const [actualizando, setActualizando] = useState<string | null>(null)

  async function cargarDatos() {
    const [resR, resP] = await Promise.all([
      fetch(trpcQueryUrl('pagos.resumenMes')),
      fetch(trpcQueryUrl('usuarios.listarPersonal')),
    ])
    if (resR.ok) setResumen((await resR.json())?.[0]?.result?.data ?? null)
    if (resP.ok) setPersonal((await resP.json())?.[0]?.result?.data ?? [])
    setCargando(false)
  }

  useEffect(() => { cargarDatos() }, [])

  async function cambiarRol(userId: string, rol: string) {
    setActualizando(userId)
    await fetch('/api/trpc/usuarios.cambiarRol?batch=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ '0': { json: { userId, rol } } }),
    })
    await cargarDatos()
    setActualizando(null)
  }

  if (isPending || cargando) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Cargando...</p>
    </div>
  )

  const morosos = resumen ? resumen.totalDeptos - resumen.pagados : 0

  return (
    <div className="min-h-screen bg-muted/40 p-4">
      <div className="mx-auto max-w-3xl space-y-4">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Panel administrador</h1>
            <p className="text-sm text-muted-foreground">
              {MESES[ahora.getMonth()]} {ahora.getFullYear()} · {session?.user?.name}
            </p>
          </div>
          <Button variant="ghost" size="sm"
            onClick={async () => { await authClient.signOut(); router.push('/login') }}>
            Salir
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold text-green-600">{resumen?.pagados ?? 0}</p>
              <p className="text-xs text-muted-foreground">Pagos del mes</p>
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
              <p className="text-2xl font-bold">{resumen?.totalDeptos ?? 0}</p>
              <p className="text-xs text-muted-foreground">Deptos. totales</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">${(resumen?.recaudado ?? 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Recaudado MXN</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-2">
          <Button variant={tab === 'resumen' ? 'default' : 'outline'} size="sm" onClick={() => setTab('resumen')}>
            Resumen circuitos
          </Button>
          <Button variant={tab === 'personal' ? 'default' : 'outline'} size="sm" onClick={() => setTab('personal')}>
            Personal y roles
          </Button>
        </div>

        {tab === 'resumen' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Estado por circuito</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(resumen?.porCircuito ?? []).map(c => {
                const pct = c.total > 0 ? Math.round((c.pagados / c.total) * 100) : 0
                return (
                  <div key={c.nombre} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{c.nombre}</span>
                      <span className="text-sm text-muted-foreground">{c.pagados}/{c.total}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {tab === 'personal' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personal del sistema</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {personal.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Sin personal registrado. Recuerda crear cuentas desde /registro y cambiar su rol aquí.
                </p>
              )}
              {personal.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                  </div>
                  <select
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm"
                    value={p.role}
                    disabled={actualizando === p.id}
                    onChange={e => cambiarRol(p.id, e.target.value)}
                  >
                    {ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  )
}