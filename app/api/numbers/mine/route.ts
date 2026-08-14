import { NextResponse } from 'next/server';
import {
  findNumberByIdentity,
  findDidLogicDomainByIdentity,
  didLogicNumberFromDomain,
} from '@/lib/twilio';

// POST /api/numbers/mine
// Body: { identity: string }
// Returns: { phoneNumber: string | null }
//
// Checks native Twilio numbers first (Mobile), then falls back to a
// DIDLogic-bridged number (Landline) — a user has at most one of either.
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
    const didNumber = domain ? didLogicNumberFromDomain(domain.domainName) : null;
    return NextResponse.json({
      phoneNumber: didNumber ? `+${didNumber}` : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/numbers/mine] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
