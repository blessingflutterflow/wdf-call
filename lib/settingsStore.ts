import { getGoogleAccessToken } from '@/lib/googleAuth';

/**
 * Global app settings (currently just the bank details shown to someone
 * paying for a number) — admin-editable, not per-user, so it doesn't fit
 * claimStore's per-user-custom-claims trick. Stored as one small JSON object
 * in the Firebase Storage bucket every Firebase project already has (same
 * bucket as NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET), via the GCS JSON API with
 * the same hand-rolled service-account auth as claimStore/push — see
 * lib/googleAuth.ts for why not the SDK.
 */
const BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!;
const SETTINGS_OBJECT = 'settings/app-settings.json';
const SCOPES = ['https://www.googleapis.com/auth/devstorage.read_write'];

export interface AppSettings {
  bankDetails: string; // free-text — bank, account name/number, branch code, reference format
  updatedAt: number;
}

const DEFAULT_SETTINGS: AppSettings = { bankDetails: '', updatedAt: 0 };

export async function getAppSettings(): Promise<AppSettings> {
  const accessToken = await getGoogleAccessToken(SCOPES);
  const res = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(SETTINGS_OBJECT)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (res.status === 404) return DEFAULT_SETTINGS;
  if (!res.ok) {
    throw new Error(`Could not read settings (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as AppSettings;
}

export async function setAppSettings(settings: AppSettings): Promise<void> {
  const accessToken = await getGoogleAccessToken(SCOPES);
  const res = await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(SETTINGS_OBJECT)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(settings),
    }
  );
  if (!res.ok) {
    throw new Error(`Could not save settings (${res.status}): ${await res.text()}`);
  }
}
