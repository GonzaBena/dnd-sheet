// src/scripts/firebase/authService.ts
import type { User } from 'firebase/auth';
import type { AppUser } from '../models/user.ts';
import { getFirebase } from './client.ts';

const AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-email': 'El email no es válido.',
  'auth/missing-password': 'Ingresá una contraseña.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese email. Probá iniciar sesión.',
  'auth/invalid-credential': 'Email o contraseña incorrectos.',
  'auth/wrong-password': 'Email o contraseña incorrectos.',
  'auth/user-not-found': 'No existe una cuenta con ese email.',
  'auth/too-many-requests': 'Demasiados intentos. Esperá unos minutos y volvé a probar.',
  'auth/popup-closed-by-user': 'Se cerró la ventana de Google antes de terminar.',
  'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Habilitá los popups para este sitio.',
  'auth/network-request-failed': 'Sin conexión. Revisá tu red e intentá de nuevo.',
  'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase Auth.',
};

export function describeAuthError(err: any): string {
  return AUTH_ERRORS[err?.code] || err?.message || 'Error de autenticación.';
}

export function toAppUser(user: User, profile?: Partial<AppUser>): AppUser {
  return {
    id: user.uid,
    name: profile?.name || user.displayName || (user.email ? user.email.split('@')[0] : 'Aventurero'),
    email: profile?.email || user.email || '',
    avatarUrl: profile?.avatarUrl || user.photoURL || undefined,
  };
}

export async function signInWithGoogle(): Promise<void> {
  const { auth } = await getFirebase();
  const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signUpWithEmail(name: string, email: string, password: string): Promise<void> {
  const { auth } = await getFirebase();
  const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (name.trim()) {
    await updateProfile(cred.user, { displayName: name.trim() });
  }
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { auth } = await getFirebase();
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { auth } = await getFirebase();
  const { sendPasswordResetEmail } = await import('firebase/auth');
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signOut(): Promise<void> {
  const { auth } = await getFirebase();
  const { signOut: fbSignOut } = await import('firebase/auth');
  await fbSignOut(auth);
}

export async function onAuthChange(cb: (user: User | null) => void): Promise<() => void> {
  const { auth } = await getFirebase();
  const { onAuthStateChanged } = await import('firebase/auth');
  return onAuthStateChanged(auth, cb);
}
