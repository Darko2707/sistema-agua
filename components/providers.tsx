'use client';

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { trpcReact } from '../lib/trpc-react';
import { TRPC_MAX_BATCH_SIZE } from '../lib/traffic-limits';

type Props = { children: React.ReactNode };

export function Providers({ children }: Props) {
  const [queryClient] = useState(() =>
    new QueryClient({
      defaultOptions: {
        queries: {
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    })
  );

  const [trpcClient] = useState(() =>
    trpcReact.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
          maxItems: TRPC_MAX_BATCH_SIZE,
          async fetch(url, options) {
            const res = await fetch(url, { ...options, credentials: 'include' });
            if (res.status === 401 && typeof window !== 'undefined') {
              const pathname = window.location.pathname;
              if (!pathname.startsWith('/login') && !pathname.startsWith('/registro')) {
                window.location.href = '/login?motivo=otro_dispositivo';
              }
            }
            return res;
          },
        }),
      ],
    })
  );

  return (
    <trpcReact.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpcReact.Provider>
  );
}
