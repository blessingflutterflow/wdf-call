import { NextResponse } from 'next/server';
import { findNumberByIdentity } from '@/lib/twilio';
import { getClaim, setClaim, type ClaimRecord } from '@/lib/claimStore';

// POST /api/numbers/claim
// Body: { identity, phoneNumber, numberType?: "mobile"|"local", fcmToken? }
// Returns: { status: "pending"|"approved", phoneNumber: string|null }
//
// Payment is manual (EFT, checked by a human) — there's no payment gateway,
// so this does NOT purchase the number. It records a request for an admin to
// approve once proof of payment is in and the Twilio balance is topped up
// (see /admin and /api/admin/claims/[uid]/approve, which does the actual
// purchase). Idempotent: a user who already owns a number gets it back
// immediately; a user with an existing pending request gets that back
// instead of filing a second one.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = body.identity as string | undefined;
    const phoneNumber = body.phoneNumber as string | undefined;
    const numberType = body.numberType === 'local' ? 'local' : 'mobile';
    const fcmToken = body.fcmToken as string | undefined;

    if (!identity || !phoneNumber) {
      return NextResponse.json(
        { error: 'identity and phoneNumber are required' },
        { status: 400 }
      );
    }

    // Already owns a number (paid + approved earlier) — return it, no new
    // request needed.
    const existing = await findNumberByIdentity(identity);
    if (existing) {
      return NextResponse.json({
        status: 'approved',
        phoneNumber: existing.phoneNumber,
        sid: existing.sid,
        reused: true,
      });
    }

    // Already has a request in flight — don't file a duplicate one, just
    // report where it stands (this also covers a 'rejected'/'failed' retry:
    // filing a fresh request for the same or a different number is fine).
    const current = await getClaim(identity);
    if (current && current.status === 'pending') {
      return NextResponse.json({
        status: 'pending',
        phoneNumber: null,
        requestedNumber: current.phoneNumber,
      });
    }

    const now = Date.now();
    const claim: ClaimRecord = {
      identity,
      phoneNumber,
      numberType,
      status: 'pending',
      requestedAt: now,
      updatedAt: now,
      ...(fcmToken ? { fcmToken } : {}),
    };
    await setClaim(identity, claim);

    return NextResponse.json({
      status: 'pending',
      phoneNumber: null,
      requestedNumber: phoneNumber,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/numbers/claim] Error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
