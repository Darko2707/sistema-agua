import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// CSP is set dynamically per-request in proxy.ts so nonces can be injected.
// Only non-CSP security headers are set statically here.
const securityHeaders = [
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
