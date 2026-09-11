import { NextResponse } from 'next/server';
import { isAuthorizedAdmin } from '@/lib/adminAuth';
import { getClaim, setClaim } from '@/lib/claimStore';
import { sendPushNotification } from '@/lib/push';

// POST /api/admin/claims/[uid]/processing
// Header: x-admin-code
// Marks that the admin is now topping up Twilio to cover this number —
// still no purchase yet, that's Approve.
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
    await setClaim(uid, { ...claim, status: 'processing', updatedAt: Date.now() });
    if (claim.fcmToken) {
      sendPushNotification(
        claim.fcmToken,
        'Processing your payment',
        `Getting ${claim.phoneNumber} ready for you.`
      ).catch((err) => console.warn('[claims/processing] push failed:', err));
    }
    return NextResponse.json({ status: 'processing' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/admin/claims/processing] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
