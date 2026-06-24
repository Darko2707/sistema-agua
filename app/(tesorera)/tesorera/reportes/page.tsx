'use client';

import { useState } from 'react';
import { ArrowLeft, FileBarChart, BarChart2, Banknote } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { trpcReact } from '@/lib/trpc-react';

import { Button }   from '@/components/ui/button';
import { ReporteResidentes } from '@/components/representante/ReporteResidentes';
import { ReporteFinanciero } from '@/components/representante/ReporteFinanciero';
import { PagosTesorera }    from '@/components/tesorera/PagosTesorera';

type TabId = 'pagos' | 'residentes' | 'financiero';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'pagos',      label: 'Pagos',       icon: <Banknote className="h-4 w-4" /> },
  { id: 'residentes', label: 'Residentes',  icon: <FileBarChart className="h-4 w-4" /> },
  { id: 'financiero', label: 'Financiero',  icon: <BarChart2 className="h-4 w-4" /> },
];

export default function TesoreraReportesPage() {
  const router   = useRouter();
  const [tab, setTab] = useState<TabId>('pagos');
  const circuitoQuery = trpcReact.circuitos.miCircuitoTesorera.useQuery();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-background sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push('/residente')} className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
            <div>
              <h1 className="text-lg font-semibold leading-none">Reportes</h1>
              {circuitoQuery.data?.nombre && (
                <p className="text-xs text-muted-foreground mt-0.5">{circuitoQuery.data.nombre}</p>
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4">
          <nav className="flex gap-1">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id
                    ? 'border-sky-600 text-sky-600'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        {tab === 'pagos'      && <PagosTesorera />}
        {tab === 'residentes' && <ReporteResidentes />}
        {tab === 'financiero' && <ReporteFinanciero />}
      </div>
    </div>
  );
}
