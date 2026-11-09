// src/scripts/firebase/client.ts
// Única inicialización de Firebase. Se importa de forma dinámica para no cargar el SDK en SSR
// ni en el modo local (sin credenciales).
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Database } from 'firebase/database';

const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};

const databaseURL: string = env.PUBLIC_FIREBASE_DATABASE_URL || '';

export const firebaseConfig = {
  apiKey: env.PUBLIC_FIREBASE_API_KEY || '',
  authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.PUBLIC_FIREBASE_PROJECT_ID || '',
  appId: env.PUBLIC_FIREBASE_APP_ID || '',
  // Realtime Database (posiciones de tokens en vivo y presencia). Si falta, el SDK usa
  // https://<projectId>-default-rtdb.firebaseio.com. Un string vacío lo rompe, por eso se omite.
  ...(databaseURL ? { databaseURL } : {}),
};

const useEmulators = String(env.PUBLIC_USE_EMULATORS || '') === 'true';

/**
 * Sin credenciales (o fuera del navegador, p.ej. en los tests de Node) la app funciona en modo local
 * con localStorage, como antes.
 */
export function isFirebaseConfigured(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && (firebaseConfig.authDomain || useEmulators));
}

export interface FirebaseClient {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  /** Alias conveniente de db para evitar confusiones de nombrado. */
  firestore: Firestore;
  rtdb: Database;
}

let clientPromise: Promise<FirebaseClient> | null = null;

export function getFirebase(): Promise<FirebaseClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { initializeApp, getApps } = await import('firebase/app');
      const { getAuth, connectAuthEmulator } = await import('firebase/auth');
      const {
        initializeFirestore,
        getFirestore,
        persistentLocalCache,
        persistentMultipleTabManager,
        connectFirestoreEmulator,
      } = await import('firebase/firestore');
      const { getDatabase, connectDatabaseEmulator } = await import('firebase/database');

      const app = getApps()[0] || initializeApp(firebaseConfig);
      const auth = getAuth(app);

      let db: Firestore;
      try {
        // Cache offline en IndexedDB compartida entre pestañas: reemplaza a localStorage como respaldo.
        db = initializeFirestore(app, {
          ignoreUndefinedProperties: true,
          localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        });
      } catch (_) {
        db = getFirestore(app);
      }

      const rtdb = getDatabase(app, databaseURL || undefined);

      if (useEmulators) {
        const host = env.PUBLIC_EMULATOR_HOST || window.location.hostname || '127.0.0.1';
        try {
          connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
          connectFirestoreEmulator(db, host, 8080);
          connectDatabaseEmulator(rtdb, host, 9000);
        } catch (_) {}
      }

      return { app, auth, db, firestore: db, rtdb };
    })();
  }
  return clientPromise;
}
