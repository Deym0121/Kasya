import { useEffect } from 'react';
import { useAuthActions, useAuthToken } from '@convex-dev/auth/react';

/**
 * Convex Auth only exposes sign-in/out (and the session JWT) as React hooks,
 * but the app's auth seam (src/convex/auth.ts) is imperative — screens call
 * plain async functions. This bridge, mounted once inside ConvexAuthProvider
 * (see App.tsx), hands the hook values to module scope so the seam can use
 * them anywhere.
 */

type AuthActions = ReturnType<typeof useAuthActions>;

let actions: AuthActions | null = null;
let token: string | null = null;

export function getAuthActions(): AuthActions | null {
  return actions;
}

/** The signed-in session's JWT — used to authenticate calls to our own HTTP endpoints only. */
export function getAuthToken(): string | null {
  return token;
}

export function AuthActionsBridge() {
  const a = useAuthActions();
  const t = useAuthToken();
  useEffect(() => {
    actions = a;
    return () => {
      actions = null;
    };
  }, [a]);
  useEffect(() => {
    token = t ?? null;
    return () => {
      token = null;
    };
  }, [t]);
  return null;
}
