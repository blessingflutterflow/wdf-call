import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';

/**
 * Server-only Firebase Admin SDK — separate from lib/firebase.ts, which is
 * the public client SDK (safe browser config, no secrets). This one holds a
 * service-account key and must never be imported from client code.
 *
 * Used as a tiny key-value store (via each user's Auth custom claims) for
 * number-claim requests awaiting manual payment approval — see
 * lib/claimStore.ts. We're intentionally not standing up a real database for
 * this; Auth is already the one piece of persistent infra every user has a
 * row in.
 */
function adminApp(): App {
  if (getApps().length) return getApps()[0];

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is not configured (Firebase Admin SDK service account key)'
    );
  }
  const serviceAccount = JSON.parse(raw);

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

export function adminAuth() {
  return getAuth(adminApp());
}

export function adminMessaging() {
  return getMessaging(adminApp());
}
