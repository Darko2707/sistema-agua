import type { Metadata } from 'next';
import { Wrench } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Mantenimiento',
  robots: { index: false, follow: false },
};

export default function MantenimientoPage() {
  return (
    <section className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-amber-100 text-amber-800">
          <Wrench aria-hidden="true" className="size-7" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          Estamos realizando mantenimiento
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          El servicio estará disponible nuevamente en breve. Puedes volver a
          intentarlo dentro de unos minutos.
        </p>
      </div>
    </section>
  );
}
