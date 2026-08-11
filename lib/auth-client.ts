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

    void authClient.getSession()
      .then((res) => {
        if (active) setData((res?.data as SessionData) ?? null);
      })
      .catch(() => {
        if (active) setData(null);
      })
      .finally(() => {
        if (active) setIsPending(false);
      });

    return () => { active = false; };
  }, []);

  return { data, isPending };
}

export const signIn = authClient.signIn;
export const signOut = authClient.signOut;

export { authClient };
export default authClient;
