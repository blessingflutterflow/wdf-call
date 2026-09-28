import { getGoogleAccessToken, projectId } from '@/lib/googleAuth';

/**
 * Per-user "can they call at all" switch — separate from claimStore's
 * per-request payment flow. Manually flipped by an admin (e.g. once someone
 * has burned through however many minutes they paid for), not tied to a
 * specific number request's lifecycle, so it lives under its own key
 * (`wdfSuspended`) on the same user's Firebase Auth custom claims — same
 * Identity Toolkit REST trick as claimStore.ts / settingsStore.ts.
 */
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

interface ToolkitUser {
  localId: string;
  email?: string;
  customAttributes?: string;
}

export async function isSuspended(identity: string): Promise<boolean> {
  const data = await identityToolkitFetch('/accounts:lookup', { localId: [identity] });
  const user = data.users?.[0] as ToolkitUser | undefined;
  if (!user?.customAttributes) return false;
  try {
    return !!JSON.parse(user.customAttributes).wdfSuspended;
  } catch {
    return false;
  }
}

export async function setSuspended(identity: string, suspended: boolean): Promise<void> {
  const data = await identityToolkitFetch('/accounts:lookup', { localId: [identity] });
  const user = data.users?.[0] as ToolkitUser | undefined;
  if (!user) throw new Error(`No such user: ${identity}`);
  let existing: Record<string, unknown> = {};
  if (user.customAttributes) {
    try {
      existing = JSON.parse(user.customAttributes);
    } catch {
      existing = {};
    }
  }
  await identityToolkitFetch('/accounts:update', {
    localId: identity,
    customAttributes: JSON.stringify({ ...existing, wdfSuspended: suspended }),
  });
}

/**
 * Finds users by email substring so an admin can look someone up to
 * suspend/unsuspend them, without having their uid handy. Pages through the
 * full user list client-side (Identity Toolkit has no search-by-email
 * filter) — fine at WDF/Nosh's scale.
 */
export async function searchUsers(
  emailContains: string
): Promise<{ uid: string; email?: string; suspended: boolean }[]> {
  const accessToken = await getGoogleAccessToken(SCOPES);
  const needle = emailContains.trim().toLowerCase();
  const matches: { uid: string; email?: string; suspended: boolean }[] = [];
  let nextPageToken: string | undefined;

  do {
    const url = new URL(`${IDENTITY_TOOLKIT}/projects/${projectId()}/accounts:batchGet`);
    url.searchParams.set('maxResults', '1000');
    if (nextPageToken) url.searchParams.set('nextPageToken', nextPageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Identity Toolkit request failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as { users?: ToolkitUser[]; nextPageToken?: string };

    for (const user of data.users ?? []) {
      if (!needle || user.email?.toLowerCase().includes(needle)) {
        let suspended = false;
        if (user.customAttributes) {
          try {
            suspended = !!JSON.parse(user.customAttributes).wdfSuspended;
          } catch {
            /* ignore */
          }
        }
        matches.push({ uid: user.localId, email: user.email, suspended });
      }
    }
    nextPageToken = data.nextPageToken;
  } while (nextPageToken && matches.length < 50);

  return matches.slice(0, 50);
}
