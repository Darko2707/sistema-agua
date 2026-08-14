import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@/server/routers';
import { TRPC_MAX_BATCH_SIZE } from '@/lib/traffic-limits';

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
      maxItems: TRPC_MAX_BATCH_SIZE,
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: 'include',
        });
      },
    }),
  ],
});
