'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, MessageCircle, RefreshCw } from 'lucide-react';

export default function VerificarEmailPage() {
  const router = useRouter();
  const [telefono, setTelefono] = useState('');
  const [perfilLoading, setPerfilLoading] = useState(true);
  const [codigo, setCodigo] = useState('');
  const [enviado, setEnviado]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [devCode, setDevCode] = useState('');

  useEffect(() => {
    let activo = true;
    trpc.usuarios.miPerfil.query()
      .then(perfil => {
        if (activo) setTelefono(perfil?.telefono ?? '');
      })
      .catch(() => {
        if (activo) setError('No se pudo cargar tu perfil.');
      })
      .finally(() => {
        if (activo) setPerfilLoading(false);
      });
    return () => { activo = false; };
  }, []);

  async function reenviarWhatsApp() {
    if (!telefono) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefono }),
      });
      const json = await res.json().catch(() => ({})) as { error?: string; devCode?: string };
      if (!res.ok) throw new Error(json.error ?? 'No se pudo enviar el codigo');
      setDevCode(json.devCode ?? '');
      setEnviado(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el codigo. Intenta de nuevo en unos minutos.');
    } finally {
      setLoading(false);
    }
  }

  async function verificarWhatsApp() {
    if (!telefono || codigo.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/whatsapp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefono, code: codigo }),
      });
      const json = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Codigo incorrecto');
      router.push('/residente');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Codigo incorrecto o expirado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-amber-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
            <MessageCircle className="h-8 w-8 text-emerald-700" />
          </div>
          <div>
            <CardTitle className="text-2xl">Verifica tu WhatsApp</CardTitle>
            <CardDescription className="mt-1">
              Enviaremos un codigo de 6 digitos a {telefono || 'tu numero registrado'}.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          {!telefono && !perfilLoading && (
            <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              No encontramos un telefono registrado. Vuelve a completar tu registro o contacta al administrador.
            </div>
          )}

          <div>
            <label htmlFor="codigo-whatsapp" className="mb-2 block text-sm font-semibold text-slate-700">Codigo de WhatsApp</label>
            <input
              id="codigo-whatsapp"
              inputMode="numeric"
              maxLength={6}
              className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-center text-lg font-bold tracking-[0.35em] outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              placeholder="123456"
              value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>

          {enviado && (
            <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              <CheckCircle className="h-4 w-4 shrink-0" />
              Codigo enviado por WhatsApp.
            </div>
          )}

          {devCode && (
            <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
              Codigo de desarrollo: {devCode}
            </div>
          )}

          {error && (
            <div role="alert" aria-live="polite" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <Button className="w-full" onClick={verificarWhatsApp} disabled={loading || codigo.length !== 6 || !telefono}>
            {loading ? 'Verificando...' : 'Verificar cuenta'}
          </Button>

          <Button variant="outline" className="w-full" onClick={reenviarWhatsApp} disabled={loading || !telefono}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {enviado ? 'Reenviar codigo' : 'Enviar codigo por WhatsApp'}
          </Button>

          <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => { authClient.signOut(); router.push('/login'); }}>
            Cerrar sesion
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}


