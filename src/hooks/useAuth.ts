import { useEffect, useState } from 'react';
import { backend } from '@backend';
import type { AppSession, OAuthProvider } from '../lib/backend/types';
import { DEV_MODE, mockSession } from '../lib/devMock';

export function useAuth() {
  const [session, setSession] = useState<AppSession | null>(DEV_MODE ? mockSession : null);
  const [loading, setLoading] = useState(!DEV_MODE);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (DEV_MODE) return;

    // `loading` keys off the backend's first session callback, not a cached
    // read: see the note on onSessionChange in lib/backend/supabase.ts.
    const timeout = window.setTimeout(() => {
      setSessionError("couldn't verify your session — check your connection and try again");
      setLoading(false);
    }, 10000);

    const unsubscribe = backend.auth.onSessionChange((newSession) => {
      window.clearTimeout(timeout);
      setSession(newSession);
      setLoading(false);
    });

    return () => {
      window.clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    return backend.auth.signIn(email, password);
  }

  async function signUp(email: string, password: string) {
    return backend.auth.signUp(email, password);
  }

  async function signInWithOAuth(provider: OAuthProvider) {
    if (DEV_MODE) {
      setSession(mockSession);
      return { error: null };
    }
    return backend.auth.signInWithOAuth(provider);
  }

  const signInWithGoogle = () => signInWithOAuth('google');
  const signInWithGithub = () => signInWithOAuth('github');

  async function signOut() {
    if (DEV_MODE) {
      setSession(null);
      return;
    }
    setSigningOut(true);
    const { error } = await backend.auth.signOut();
    setSigningOut(false);
    if (error) {
      console.error('signOut failed', error);
      setSessionError("couldn't sign you out — check your connection and try again");
    }
  }

  return {
    session,
    loading,
    sessionError,
    dismissSessionError: () => setSessionError(null),
    signIn,
    signUp,
    signInWithGoogle,
    signInWithGithub,
    signOut,
    signingOut,
    supportsOAuth: backend.auth.supportsOAuth,
  };
}
