import { getGoogleAccessToken, projectId } from '@/lib/googleAuth';
import { sendPushNotification } from '@/lib/push';

/**
 * Which devices should get "someone submitted proof of payment" pushes.
 * There's no admin login (just the shared access code), so a device
 * registers itself the moment it successfully unlocks the Admin dashboard —
 * see /api/admin/register-device. Stored the same way as bank details: a
 * `wdfAdminDevices` key on the fixed settings-anchor account (see
 * settingsStore.ts for why that account, specifically).
 */
const SETTINGS_ANCHOR_UID = 'aMuMvctjGcTUOEJsG6OTVfPPqoy1';
const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1';
const SCOPES = ['https://www.googleapis.com/auth/identitytoolkit'];

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

export async function registerAdminDevice(fcmToken: string): Promise<void> {
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
  const tokens = new Set<string>((existing.wdfAdminDevices as string[] | undefined) ?? []);
  tokens.add(fcmToken);
  await identityToolkitFetch('/accounts:update', {
    localId: SETTINGS_ANCHOR_UID,
    customAttributes: JSON.stringify({ ...existing, wdfAdminDevices: [...tokens] }),
  });
}

/** Best-effort push to every registered admin device. Never throws. */
export async function notifyAdmins(title: string, body: string): Promise<void> {
  try {
    const data = await identityToolkitFetch('/accounts:lookup', {
      localId: [SETTINGS_ANCHOR_UID],
    });
    const user = data.users?.[0] as { customAttributes?: string } | undefined;
    if (!user?.customAttributes) return;
    const attrs = JSON.parse(user.customAttributes);
    const tokens = (attrs.wdfAdminDevices as string[] | undefined) ?? [];
    await Promise.all(
      tokens.map((token) =>
        sendPushNotification(token, title, body).catch((err) =>
          console.warn('[notifyAdmins] push failed for a device:', err)
        )
      )
    );
  } catch (err) {
    console.warn('[notifyAdmins] failed:', err);
  }
}
