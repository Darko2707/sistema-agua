'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient, useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, CheckCircle, RefreshCw } from 'lucide-react';

export default function VerificarEmailPage() {
  const router = useRouter();
  const [enviado, setEnviado]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const { data: session } = useSession();

  async function reenviarEmail() {
    if (!session?.user?.email) return;
    setLoading(true);
    setError('');
    try {
      await authClient.sendVerificationEmail({
        email:       session.user.email,
        callbackURL: '/residente',
      });
      setEnviado(true);
    } catch {
      setError('No se pudo enviar el correo. Intenta de nuevo en unos minutos.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-white to-cyan-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-100">
            <Mail className="h-8 w-8 text-sky-600" />
          </div>
          <div>
            <CardTitle className="text-2xl">Verifica tu correo</CardTitle>
            <CardDescription className="mt-1">
              Enviamos un enlace de verificación a{' '}
              <span className="font-medium text-foreground">{session?.user?.email ?? 'tu correo'}</span>
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          <p className="text-sm text-muted-foreground text-center">
            Revisa tu bandeja de entrada y haz clic en el enlace para activar tu cuenta. Si no lo ves, revisa la carpeta de spam.
          </p>

          {enviado && (
            <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              <CheckCircle className="h-4 w-4 shrink-0" />
              Correo reenviado. Revisa tu bandeja de entrada.
            </div>
          )}

          {error && (
            <div role="alert" aria-live="polite" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <Button
            variant="outline"
            className="w-full"
            onClick={reenviarEmail}
            disabled={loading || enviado}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Enviando...' : enviado ? 'Correo enviado' : 'Reenviar correo de verificación'}
          </Button>

          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => { authClient.signOut(); router.push('/login'); }}
          >
            Cerrar sesión
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
