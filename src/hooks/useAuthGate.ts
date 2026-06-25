import { useEffect, useState } from 'react';
import { auth, testConnection, signInWithGoogle, logoutUser } from '../firebase';
import { ResolvedAccess } from '../config/access';

export interface ConfirmedIdentity {
  name: string;
  role: string;
}

/**
 * Owns sign-in/sign-out and sandbox-bypass mode. Pulled out of App.tsx as
 * its own domain.
 *
 * Deliberately does NOT take staffList or compute isRegisteredStaff/
 * needsOnboarding/the access-tier resolution here, even though those
 * conceptually belong to "auth" — staffList comes from useHydration, which
 * itself needs firebaseUser (this hook's output) to decide whether to sync
 * from the cloud. Hooks can't depend on each other's outputs as inputs in
 * a cycle, so the staffList-dependent pieces live in App.tsx instead, after
 * both hooks have run. This hook only returns the access state + setter so
 * App.tsx's effect can populate it.
 */
export function useAuthGate() {
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [isFirebaseSyncEnabled, setIsFirebaseSyncEnabled] = useState<boolean>(false);
  // Resolved access tier + scope for the signed-in user (Phase A foundation).
  // Resolved in App.tsx (needs staffList) — this hook just owns the state.
  const [access, setAccess] = useState<ResolvedAccess>({ accessLevel: 'staff', email: '' });

  // RBAC Sandbox Bypass monitoring
  const [isSandboxBypassActive, setIsSandboxBypassActive] = useState<boolean>(false);

  // First-run identity confirmation, shown once before the workspace setup wizard.
  const [confirmedIdentity, setConfirmedIdentity] = useState<ConfirmedIdentity | null>(null);

  // --- FIREBASE AUTHENTICATION INITIALIZER WITH COEXISTING CLOUD TOGGLE ---
  useEffect(() => {
    testConnection();
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setFirebaseUser(user);
      setIsFirebaseSyncEnabled(!!user);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('Sign-in error:', err);
    }
  };

  const handleSignOut = async () => {
    try {
      await logoutUser();
      setFirebaseUser(null);
      setIsFirebaseSyncEnabled(false);
      setIsSandboxBypassActive(false);
      window.location.reload();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Gating route enforcement (RBAC) — only the part that doesn't need staffList.
  const isAuthorized = firebaseUser !== null || isSandboxBypassActive;

  return {
    firebaseUser,
    isFirebaseSyncEnabled,
    access,
    setAccess,
    isSandboxBypassActive,
    setIsSandboxBypassActive,
    confirmedIdentity,
    setConfirmedIdentity,
    handleGoogleSignIn,
    handleSignOut,
    isAuthorized,
  };
}
