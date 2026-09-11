import { NextResponse } from 'next/server';
import {
  findNumberByIdentity,
  findDidLogicDomainByIdentity,
  didLogicNumberFromDomain,
} from '@/lib/twilio';
import { findDidwwNumberByOwner } from '@/lib/didww';
import { getClaim } from '@/lib/claimStore';

// POST /api/numbers/mine
// Body: { identity: string }
// Returns: { phoneNumber: string | null, status: "approved"|"pending"|"rejected"|"failed"|"none",
//            requestedNumber?: string, error?: string }
//
// Checks native Twilio numbers first (Mobile), then a DIDLogic-bridged
// number, then a DIDWW-bridged number — a user has at most one number
// across all three. If none of those own a number yet, falls back to their
// claim-request status (pending manual payment approval — see
// lib/claimStore.ts) so the app can show "waiting for approval" instead of
// a bare "no number".
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = body.identity as string | undefined;

    if (!identity) {
      return NextResponse.json(
        { error: 'identity is required' },
        { status: 400 }
      );
    }

    // Native Twilio is the primary source and stays strict — if this call
    // fails, that's a real problem worth surfacing.
    const existing = await findNumberByIdentity(identity);
    if (existing) {
      return NextResponse.json({ phoneNumber: existing.phoneNumber, status: 'approved' });
    }

    // DIDLogic and DIDWW are optional side-providers, each with its own
    // account and credentials. A broken/unapproved side-provider account
    // (e.g. an expired DIDWW Api-Key → "Authorization failed") must NOT take
    // down this whole endpoint and lock every user out of the dialer — it
    // just means "no number from that source". Logged, not thrown.
    try {
      const domain = await findDidLogicDomainByIdentity(identity);
      const didLogicNumber = domain
        ? didLogicNumberFromDomain(domain.domainName)
        : null;
      if (didLogicNumber) {
        return NextResponse.json({ phoneNumber: `+${didLogicNumber}`, status: 'approved' });
      }
    } catch (e) {
      console.warn('[/api/numbers/mine] DIDLogic lookup skipped:', e);
    }

    try {
      const didwwNumber = await findDidwwNumberByOwner(identity);
      if (didwwNumber) {
        return NextResponse.json({ phoneNumber: didwwNumber, status: 'approved' });
      }
    } catch (e) {
      console.warn('[/api/numbers/mine] DIDWW lookup skipped:', e);
    }

    // No purchased number anywhere — report the claim-request status instead.
    try {
      const claim = await getClaim(identity);
      if (claim) {
        return NextResponse.json({
          phoneNumber: null,
          status: claim.status, // 'pending' | 'rejected' | 'failed'
          requestedNumber: claim.phoneNumber,
          ...(claim.error ? { error: claim.error } : {}),
        });
      }
    } catch (e) {
      console.warn('[/api/numbers/mine] claim lookup skipped:', e);
    }

    return NextResponse.json({ phoneNumber: null, status: 'none' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/numbers/mine] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
