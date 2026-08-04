import { convexAuth } from '@convex-dev/auth/server';
import { Password } from '@convex-dev/auth/providers/Password';

/**
 * Convex Auth: email + password now; Google OAuth is staged for later
 * (add the Google provider here + EXPO_PUBLIC_GOOGLE_SIGNIN flag in the app).
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
