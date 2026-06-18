import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  const result = await auth.api.requestPasswordReset({
    body: {
      email,
      redirectTo: '/reset-password',
    },
    headers: req.headers,
  });

  return NextResponse.json(result);
}
