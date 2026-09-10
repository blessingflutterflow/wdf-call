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

    const existing = await findNumberByIdentity(identity);
    if (existing) {
      return NextResponse.json({ phoneNumber: existing.phoneNumber });
    }

    const domain = await findDidLogicDomainByIdentity(identity);
    const didLogicNumber = domain ? didLogicNumberFromDomain(domain.domainName) : null;
    if (didLogicNumber) {
      return NextResponse.json({ phoneNumber: `+${didLogicNumber}` });
    }

    const didwwNumber = await findDidwwNumberByOwner(identity);
    return NextResponse.json({ phoneNumber: didwwNumber });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/numbers/mine] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
