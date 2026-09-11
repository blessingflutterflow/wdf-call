import { getGoogleAccessToken, projectId } from '@/lib/googleAuth';

/**
 * Global app settings (currently just the bank details shown to someone
 * paying for a number) — admin-editable, not per-user, so it doesn't fit
 * claimStore's "one claim per requesting user" shape directly. Rather than
 * provision real infra for one small text blob under a deadline (Cloud
 * Storage's bucket for this project turned out not to actually exist —
 * NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is set but Storage was never turned
 * on), this reuses the exact same trick claimStore.ts already proved out:
 * stash it in a real Firebase Auth user's custom claims via the Identity
 * Toolkit REST API, just under a different key (`wdfAppSettings`) so it
 * doesn't collide with that user's own claim if they ever have one.
 *
 * SETTINGS_ANCHOR_UID is an arbitrary, already-existing, never-deleted
 * account used purely as a place to hang this global blob — it has nothing
 * to do with who that account actually belongs to.
 */
const SETTINGS_ANCHOR_UID = 'aMuMvctjGcTUOEJsG6OTVfPPqoy1';

const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1';
const SCOPES = ['https://www.googleapis.com/auth/identitytoolkit'];

export interface AppSettings {
  bankDetails: string;
  updatedAt: number;
}

const DEFAULT_SETTINGS: AppSettings = { bankDetails: '', updatedAt: 0 };

async function identityToolkitFetch(path: string, body: unknown) {
  const accessToken = await getGoogleAccessToken(SCOPES);
  const res = await fetch(`${IDENTITY_TOOLKIT}/projects/${projectId()}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Identity Toolkit request failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export async function getAppSettings(): Promise<AppSettings> {
  const data = await identityToolkitFetch('/accounts:lookup', {
    localId: [SETTINGS_ANCHOR_UID],
  });
  const user = data.users?.[0] as { customAttributes?: string } | undefined;
  if (!user?.customAttributes) return DEFAULT_SETTINGS;
  try {
    const attrs = JSON.parse(user.customAttributes);
    return (attrs?.wdfAppSettings as AppSettings | undefined) ?? DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function setAppSettings(settings: AppSettings): Promise<void> {
  const data = await identityToolkitFetch('/accounts:lookup', {
    localId: [SETTINGS_ANCHOR_UID],
  });
  const user = data.users?.[0] as { customAttributes?: string } | undefined;
  let existing: Record<string, unknown> = {};
  if (user?.customAttributes) {
    try {
      existing = JSON.parse(user.customAttributes);
    } catch {
      existing = {};
    }
  }
  await identityToolkitFetch('/accounts:update', {
    localId: SETTINGS_ANCHOR_UID,
    customAttributes: JSON.stringify({ ...existing, wdfAppSettings: settings }),
  });
}
