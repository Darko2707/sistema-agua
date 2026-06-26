'use client';

import { Suspense } from 'react';
import { ResidenteDashboard } from '@/components/residente/ResidenteDashboard';

export default function ResidentePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" role="status" aria-live="polite" aria-label="Cargando">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    }>
      <ResidenteDashboard />
    </Suspense>
  );
}
