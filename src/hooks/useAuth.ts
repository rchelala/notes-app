import { useState, useEffect } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import { auth } from '../lib/firebase';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async () => {
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      const message = (err as { message?: string }).message ?? String(err);
      console.error('Sign-in error:', code, message);

      if (code === 'auth/popup-blocked') {
        setAuthError('Popup was blocked. Please allow popups for this site and try again.');
      } else if (code === 'auth/unauthorized-domain') {
        setAuthError('This domain is not authorized in Firebase. Add it under Authentication → Settings → Authorized domains.');
      } else if (code === 'auth/operation-not-allowed') {
        setAuthError('Google sign-in is not enabled. Enable it in Firebase Console → Authentication → Sign-in method.');
      } else if (code === 'auth/popup-closed-by-user') {
        // User closed it intentionally — no message needed
      } else {
        setAuthError(`Sign-in failed: ${code || message}`);
      }
    }
  };

  const signOutUser = async () => {
    await signOut(auth);
  };

  return { user, loading, authError, signIn, signOut: signOutUser };
};
