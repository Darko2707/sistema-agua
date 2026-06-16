'use client';

import { createAuthClient } from 'better-auth/client';
import { useState, useEffect } from 'react';

const authClient = createAuthClient();

type SessionData = {
  user: {
    id: string;
    name: string;
    email: string;
    role?: string;
  };
} | null;

export function useSession() {
  const [data, setData] = useState<SessionData>(null);
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    let active = true;
    authClient.getSession().then((res: any) => {
      if (active) {
        setData(res?.data ?? null);
        setIsPending(false);
      }
    });
    return () => { active = false; };
  }, []);

  return { data, isPending };
}

export const signIn = authClient.signIn;
export const signOut = authClient.signOut;
export const resetPassword = authClient.resetPassword;

export { authClient };
export default authClient;