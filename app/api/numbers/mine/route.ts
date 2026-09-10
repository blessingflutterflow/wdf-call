import { NextResponse } from 'next/server';
import {
  findNumberByIdentity,
  findDidLogicDomainByIdentity,
  didLogicNumberFromDomain,
} from '@/lib/twilio';
import { findDidwwNumberByOwner } from '@/lib/didww';

// POST /api/numbers/mine
// Body: { identity: string }
// Returns: { phoneNumber: string | null }
//
// Checks native Twilio numbers first (Mobile), then a DIDLogic-bridged
// number, then a DIDWW-bridged number — a user has at most one number
// across all three. DIDWW numbers show up here as soon as they're
// purchased+tagged (register/route.ts does this at submit time), even
// while still `awaiting_registration` on DIDWW's side — matches the app's
// success screen, which shows the number immediately as "yours, pending".
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
      return NextResponse.json({ phoneNumber: existing.phoneNumber });
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
        return NextResponse.json({ phoneNumber: `+${didLogicNumber}` });
      }
    } catch (e) {
      console.warn('[/api/numbers/mine] DIDLogic lookup skipped:', e);
    }

    try {
      const didwwNumber = await findDidwwNumberByOwner(identity);
      if (didwwNumber) {
        return NextResponse.json({ phoneNumber: didwwNumber });
      }
    } catch (e) {
      console.warn('[/api/numbers/mine] DIDWW lookup skipped:', e);
    }

    return NextResponse.json({ phoneNumber: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/numbers/mine] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
