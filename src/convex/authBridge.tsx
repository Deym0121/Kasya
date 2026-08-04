import { useEffect } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';

/**
 * Convex Auth only exposes sign-in/out as React hooks, but the app's auth seam
 * (src/convex/auth.ts) is imperative — screens call plain async functions.
 * This bridge, mounted once inside ConvexAuthProvider (see App.tsx), hands the
 * hook's actions to module scope so the seam can use them anywhere.
 */

type AuthActions = ReturnType<typeof useAuthActions>;

let actions: AuthActions | null = null;

export function getAuthActions(): AuthActions | null {
  return actions;
}

export function AuthActionsBridge() {
  const a = useAuthActions();
  useEffect(() => {
    actions = a;
    return () => {
      actions = null;
    };
  }, [a]);
  return null;
}
