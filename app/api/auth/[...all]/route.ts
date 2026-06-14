// app/api/auth/[...all]/route.ts
import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // ← fuerza runtime Node.js, no Edge

export const { GET, POST } = toNextJsHandler(auth);