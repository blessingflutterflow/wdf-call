import { adminAuth } from '@/lib/firebaseAdmin';

/**
 * Payment is manual (EFT to a bank account, checked by a human) — there's no
 * payment gateway. So claiming a number is a two-step request/approve flow:
 * the app records a *request*, an admin checks proof of payment out of band,
 * tops up the Twilio balance, then approves — which is the moment the number
 * actually gets purchased. This is the store for that in-between "pending"
 * state.
 *
 * No database: each request lives in the requesting user's Firebase Auth
 * custom claims, under the `wdfClaim` key. That's fine at WDF Call's scale —
 * one claim per user, a handful of users at a time — and it means zero new
 * infra beyond Auth, which every user already has a row in.
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

export async function getClaim(identity: string): Promise<ClaimRecord | null> {
  const user = await adminAuth().getUser(identity);
  const claim = user.customClaims?.wdfClaim as ClaimRecord | undefined;
  return claim ?? null;
}

export async function setClaim(
  identity: string,
  claim: ClaimRecord
): Promise<void> {
  const user = await adminAuth().getUser(identity);
  await adminAuth().setCustomUserClaims(identity, {
    ...(user.customClaims ?? {}),
    wdfClaim: claim,
  });
}

/**
 * Every pending claim across all users. Firebase Auth has no "query by
 * custom claim" — so this pages through the full user list and filters
 * server-side. Fine for WDF Call's user count; would need a real database
 * well before this becomes a problem.
 */
export async function listPendingClaims(): Promise<
  (ClaimRecord & { uid: string; email?: string })[]
> {
  const pending: (ClaimRecord & { uid: string; email?: string })[] = [];
  let pageToken: string | undefined;
  do {
    const page = await adminAuth().listUsers(1000, pageToken);
    for (const user of page.users) {
      const claim = user.customClaims?.wdfClaim as ClaimRecord | undefined;
      if (claim && claim.status === 'pending') {
        pending.push({ ...claim, uid: user.uid, email: user.email });
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);
  pending.sort((a, b) => a.requestedAt - b.requestedAt);
  return pending;
}
