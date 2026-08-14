import { auth } from '@/lib/auth';
import { guardAuthAccountRequest } from '@/lib/auth-route-guard';
import { toNextJsHandler } from 'better-auth/next-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const handler = toNextJsHandler(auth);

export const GET = handler.GET;
export async function POST(request: Request) {
  const limited = await guardAuthAccountRequest(request);
  return limited ?? handler.POST(request);
}
