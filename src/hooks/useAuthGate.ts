import { useEffect, useState } from 'react';
import { auth, testConnection, signInWithGoogle, logoutUser, dbSetDoc } from '../firebase';
import { resolveAccess, ResolvedAccess } from '../config/access';
import type { StaffMember } from '../types';

export interface ConfirmedIdentity {
  name: string;
  role: string;
}

/**
 * Owns sign-in/sign-out, the resolved RBAC access tier, sandbox-bypass mode,
 * and the derived "is this person allowed in, and do they need onboarding"
 * booleans. Pulled out of App.tsx as its own domain: every piece of state
 * and every effect here exists only to answer "who is this, and are they
 * let in" — nothing about facilities, rosters, or tasks leaks into it.
 */
export function useAuthGate(staffList: StaffMember[]) {
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [isFirebaseSyncEnabled, setIsFirebaseSyncEnabled] = useState<boolean>(false);
  // Resolved access tier + scope for the signed-in user (Phase A foundation).
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

  // Resolve the signed-in user's access tier from their email (super-user allowlist
  // → matching staff record), and mirror it into a rules-friendly users/{uid} doc.
  // Phase A: additive only — this does not yet change what the UI shows.
  useEffect(() => {
    if (!firebaseUser) {
      setAccess({ accessLevel: 'staff', email: '' });
      return;
    }
    const resolved = resolveAccess(firebaseUser.email, staffList);
    setAccess(resolved);
    dbSetDoc('users', firebaseUser.uid, {
      id: firebaseUser.uid,
      email: resolved.email,
      accessLevel: resolved.accessLevel,
      facilityId: resolved.facilityId || '',
      departmentId: resolved.departmentId || '',
    }).catch(() => {});
  }, [firebaseUser, staffList]);

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

  // Gating route enforcement (RBAC)
  const isAuthorized = firebaseUser !== null || isSandboxBypassActive;
  const isRegisteredStaff = staffList.some(s => s.email?.toLowerCase().trim() === firebaseUser?.email?.toLowerCase().trim());
  const needsOnboarding = !!(firebaseUser && !isRegisteredStaff);

  return {
    firebaseUser,
    isFirebaseSyncEnabled,
    access,
    isSandboxBypassActive,
    setIsSandboxBypassActive,
    confirmedIdentity,
    setConfirmedIdentity,
    handleGoogleSignIn,
    handleSignOut,
    isAuthorized,
    isRegisteredStaff,
    needsOnboarding,
  };
}
