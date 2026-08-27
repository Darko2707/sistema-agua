import * as Sentry from '@sentry/nextjs';
import { sentryEnvironment } from '@/lib/sentry-config';

Sentry.init({
  dsn:              process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment:      sentryEnvironment(),
  enabled:          !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
});

export function onRouterTransitionStart(url: string) {
  Sentry.addBreadcrumb({ category: 'navigation', message: url, level: 'info' });
}
