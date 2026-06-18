import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, collection, getDocs, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// EXPORT DB & AUTH as per Skill requirements
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Standard Operational Types
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

// CRITICAL EXPLICIT ERROR HANDLER REQUIRED BY FIRESTORE SKILL
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error details: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// CRITICAL CONNECTION VALIDATOR ON APP BOOT
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration or network proxy connectivity.");
    }
  }
}

// Custom sign-in wrapper to easily trigger popups with error safety
export async function signInWithGoogle() {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return cred.user;
  } catch (err) {
    console.error('Google login failed:', err);
    throw err;
  }
}

export async function logoutUser() {
  try {
    await signOut(auth);
  } catch (err) {
    console.error('Sign out failed:', err);
  }
}

// --- SECURE DATA ACCESS WRAPPERS (ABAC COMPLIANT) ---

export async function dbGetCollection<T>(path: string): Promise<T[]> {
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs.map(d => ({ ...d.data(), id: d.id }) as T);
  } catch (err) {
    return handleFirestoreError(err, OperationType.GET, path);
  }
}

function sanitizePayload<T>(obj: T): any {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizePayload(item));
  }
  if (typeof obj === 'object') {
    const clean: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      const val = (obj as any)[key];
      if (val !== undefined) {
        clean[key] = sanitizePayload(val);
      }
    }
    return clean;
  }
  return obj;
}

export async function dbSetDoc<T extends { id: string }>(path: string, id: string, data: T): Promise<void> {
  try {
    const docRef = doc(db, path, id);
    // Explicit clean write
    const cleanData = sanitizePayload(data);
    await setDoc(docRef, cleanData, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${path}/${id}`);
  }
}

export async function dbDeleteDoc(path: string, id: string): Promise<void> {
  try {
    const docRef = doc(db, path, id);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${path}/${id}`);
  }
}

export async function dbGetDoc<T>(path: string, id: string): Promise<T | null> {
  try {
    const snap = await getDocFromServer(doc(db, path, id));
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as T;
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Saves a list of items to Firestore securely using batch writes for atomic transactions.
 */
export async function dbSaveListAtomic<T extends { id: string }>(path: string, items: T[]): Promise<void> {
  try {
    const batch = writeBatch(db);
    items.forEach(item => {
      const docRef = doc(db, path, item.id);
      const cleanItem = sanitizePayload(item);
      batch.set(docRef, cleanItem, { merge: true });
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}
