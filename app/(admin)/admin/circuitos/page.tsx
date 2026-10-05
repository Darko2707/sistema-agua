'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Ruta heredada: los circuitos se migraron uno a uno a fraccionamientos. */
export default function CircuitosRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/fraccionamientos');
  }, [router]);

  return null;
}
