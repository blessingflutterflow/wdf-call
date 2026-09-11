import { getGoogleAccessToken, projectId } from '@/lib/googleAuth';

/**
 * Payment is manual (EFT to a bank account, checked by a human) — there's no
 * payment gateway. So claiming a number is a two-step request/approve flow:
 * the app records a *request*, an admin checks proof of payment out of band,
 * tops up the Twilio balance, then approves — which is the moment the number
 * actually gets purchased. This is the store for that in-between "pending"
 * state.
 *
 * No database: each request lives in the requesting user's Firebase Auth
 * custom claims (`customAttributes`, in Identity Toolkit's terms), under a
 * `wdfClaim` key. That's fine at WDF Call's scale — one claim per user, a
 * handful of users at a time — and it means zero new infra beyond Auth,
 * which every user already has a row in.
 *
 * Talks to the Identity Toolkit REST API directly (not the firebase-admin
 * SDK) — see lib/googleAuth.ts for why: firebase-admin's Auth module pulls
 * in a dependency chain Vercel's bundler can't load at all.
 */
export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'failed';

export interface ClaimRecord {
  identity: string;
  phoneNumber: string; // the number they picked
  numberType: 'local' | 'mobile';
  status: ClaimStatus;
  requestedAt: number; // epoch ms
  updatedAt: number;
  fcmToken?: string; // for the "your number is ready" push, best-effort
  twilioSid?: string; // set once approved
  error?: string; // set if approval failed (e.g. number no longer available)
}

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
  customAttributes?: string; // JSON-encoded
}

function parseClaim(user: ToolkitUser): ClaimRecord | null {
  if (!user.customAttributes) return null;
  try {
    const attrs = JSON.parse(user.customAttributes);
    return (attrs?.wdfClaim as ClaimRecord | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function getClaim(identity: string): Promise<ClaimRecord | null> {
  const data = await identityToolkitFetch('/accounts:lookup', {
    localId: [identity],
  });
  const user = data.users?.[0] as ToolkitUser | undefined;
  if (!user) throw new Error(`No such user: ${identity}`);
  return parseClaim(user);
}

export async function setClaim(identity: string, claim: ClaimRecord): Promise<void> {
  // customAttributes replaces the WHOLE blob, so preserve anything else
  // already stored there (there isn't anything else today, but this is the
  // same non-destructive pattern firebase-admin's setCustomUserClaims uses).
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
    customAttributes: JSON.stringify({ ...existing, wdfClaim: claim }),
  });
}

/**
 * Every pending claim across all users. Identity Toolkit has no "query by
 * custom claim" — so this pages through the full user list and filters
 * server-side. Fine for WDF Call's user count; would need a real database
 * well before this becomes a problem.
 */
export async function listPendingClaims(): Promise<
  (ClaimRecord & { uid: string; email?: string })[]
> {
  const accessToken = await getGoogleAccessToken(SCOPES);
  const pending: (ClaimRecord & { uid: string; email?: string })[] = [];
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
      const claim = parseClaim(user);
      if (claim && claim.status === 'pending') {
        pending.push({ ...claim, uid: user.localId, email: user.email });
      }
    }
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  pending.sort((a, b) => a.requestedAt - b.requestedAt);
  return pending;
}
