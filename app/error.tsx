'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100">
          <AlertTriangle className="h-8 w-8 text-red-600" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Algo salió mal</h1>
        <p className="text-slate-500 text-sm mb-6">
          Ocurrió un error inesperado. El equipo ha sido notificado automáticamente.
          {error.digest && (
            <span className="block mt-1 font-mono text-xs text-slate-400">
              ID: {error.digest}
            </span>
          )}
        </p>
        <Button onClick={unstable_retry}>Intentar de nuevo</Button>
      </div>
    </div>
  );
}
