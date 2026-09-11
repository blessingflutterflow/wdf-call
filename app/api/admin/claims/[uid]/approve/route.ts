import { NextResponse } from 'next/server';
import { isAuthorizedAdmin } from '@/lib/adminAuth';
import { getClaim, setClaim } from '@/lib/claimStore';
import { purchaseNumberForIdentity } from '@/lib/purchase';
import { sendPushNotification } from '@/lib/push';

// POST /api/admin/claims/[uid]/approve
// Header: x-admin-code
//
// The moment of truth: this is what actually spends money. Only call it
// after proof of payment has been checked by a human AND the Twilio balance
// has been topped up to cover it — nothing upstream of this enforces either.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ uid: string }> }
) {
  if (!isAuthorizedAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { uid } = await params;

  try {
    const claim = await getClaim(uid);
    if (!claim) {
      return NextResponse.json({ error: 'No claim on file for this user' }, { status: 404 });
    }
    if (claim.status === 'approved') {
      // Already done — idempotent, so a double-tap in the admin UI is harmless.
      return NextResponse.json({ status: 'approved', phoneNumber: claim.phoneNumber });
    }

    const origin = process.env.PUBLIC_BASE_URL || new URL(request.url).origin;

    let purchased;
    try {
      purchased = await purchaseNumberForIdentity(
        uid,
        claim.phoneNumber,
        claim.numberType,
        origin
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Twilio purchase failed';
      await setClaim(uid, {
        ...claim,
        status: 'failed',
        error: message,
        updatedAt: Date.now(),
      });
      // 200, not 500 — this is a handled outcome the admin UI should display
      // (e.g. "number no longer available"), not a server error.
      return NextResponse.json({ status: 'failed', error: message });
    }

    await setClaim(uid, {
      ...claim,
      status: 'approved',
      twilioSid: purchased.sid,
      updatedAt: Date.now(),
    });

    // Best-effort: let them know without needing to reopen the app. Never
    // let a push failure undo the approval that already happened above.
    if (claim.fcmToken) {
      try {
        await sendPushNotification(
          claim.fcmToken,
          'Your WDF Call number is ready',
          `${purchased.phoneNumber} is live — you can call and receive calls now.`
        );
      } catch (err) {
        console.warn('[/api/admin/claims/approve] push notification failed:', err);
      }
    }

    return NextResponse.json({ status: 'approved', phoneNumber: purchased.phoneNumber });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/admin/claims/approve] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
