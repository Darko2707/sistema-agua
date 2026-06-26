import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// CSP estático — compatible con SSR, SSG y Turbopack HMR.
// 'unsafe-inline' es suficiente para este sistema (no es banking ni salud).
// Los nonces requieren rendering dinámico en todas las páginas, lo que
// deshabilita caché CDN y no aporta seguridad adicional significativa aquí.
const isDev = process.env.NODE_ENV === 'development';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https:",
  "font-src 'self'",
  // Sentry ingest + Mercado Pago APIs
  "connect-src 'self' https://*.mercadopago.com https://*.ingest.sentry.io",
  "frame-src https://www.mercadopago.com.mx https://www.mercadopago.com https://www.mercadolibre.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy',   value: csp },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'X-DNS-Prefetch-Control',    value: 'on' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default withSentryConfig(nextConfig, {
  org:     process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent:  true,
  // Source map upload requires SENTRY_AUTH_TOKEN; disable until CI pipeline is configured
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  // Disable auto-instrumentation: we use instrumentation.ts / instrumentation-client.ts instead.
  // This avoids conflicts with Next.js 16 breaking changes (proxy rename, etc.)
  webpack: {
    autoInstrumentServerFunctions: false,
    autoInstrumentMiddleware:      false,
    autoInstrumentAppDirectory:    false,
  },
});
