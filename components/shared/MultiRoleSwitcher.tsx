'use client';

import { useRouter, usePathname } from 'next/navigation';
import { ArrowLeftRight, Shield } from 'lucide-react';
import { trpcReact } from '@/lib/trpc-react';

const ROL_CONFIG: Record<string, { label: string; path: string }> = {
  admin: { label: 'Admin', path: '/admin' },
  representante: { label: 'Representante', path: '/representante' },
  tesorera: { label: 'Tesorero', path: '/tesorera/reportes' },
  cuadrilla_cortes: { label: 'Cuadrilla', path: '/trabajador' },
  residente: { label: 'Residente', path: '/residente' },
};

interface Props {
  className?: string;
  theme?: 'dark' | 'light';
}

export function MultiRoleSwitcher({ className, theme = 'dark' }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const misRolesQ = trpcReact.usuarios.misRoles.useQuery();

  const data = misRolesQ.data;
  if (!data || !Array.isArray(data.roles) || data.roles.length <= 1) {
    return null;
  }

  const isDark = theme === 'dark';

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-1 sm:gap-1.5 rounded-2xl sm:rounded-full p-1 text-xs font-semibold shadow-sm transition-all max-w-full ${
        isDark
          ? 'bg-black/30 border border-white/15 text-white'
          : 'bg-muted border border-border text-foreground'
      } ${className ?? ''}`}
      role="navigation"
      aria-label="Selector de rol operativo"
    >
      <div className="flex items-center gap-1 px-2 text-[11px] opacity-75">
        <ArrowLeftRight className="h-3 w-3" />
        <span className="hidden sm:inline">Rol:</span>
      </div>
      {data.roles.map((rol) => {
        const config = ROL_CONFIG[rol];
        if (!config) return null;
        const active = pathname.startsWith(config.path);

        return (
          <button
            key={rol}
            type="button"
            onClick={() => {
              if (!active) router.push(config.path);
            }}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition-all ${
              active
                ? isDark
                  ? 'bg-amber-500 text-slate-900 shadow-sm font-bold'
                  : 'bg-primary text-primary-foreground shadow-sm font-bold'
                : isDark
                ? 'text-white/80 hover:text-white hover:bg-white/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/80'
            }`}
          >
            <Shield className="h-2.5 w-2.5" />
            <span>{config.label}</span>
          </button>
        );
      })}
    </div>
  );
}
