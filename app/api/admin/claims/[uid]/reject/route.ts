import { NextResponse } from 'next/server';
import { isAuthorizedAdmin } from '@/lib/adminAuth';
import { getClaim, setClaim } from '@/lib/claimStore';
import { sendPushNotification } from '@/lib/push';

// POST /api/admin/claims/[uid]/reject
// Header: x-admin-code
// Body (optional): { reason: string } — shown to the requester
// No Twilio call here — rejecting a request never costs anything. The user
// can submit a fresh request afterward (claim/route.ts allows a new request
// once the existing one isn't open).
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
    const body = await request.json().catch(() => ({}));
    const reason = (body.reason as string | undefined)?.trim() || undefined;

    await setClaim(uid, {
      ...claim,
      status: 'rejected',
      ...(reason ? { rejectReason: reason } : {}),
      updatedAt: Date.now(),
    });
    if (claim.fcmToken) {
      sendPushNotification(
        claim.fcmToken,
        'Your request needs another look',
        reason || `We couldn't approve your request for ${claim.phoneNumber}. Please try again.`
      ).catch((err) => console.warn('[claims/reject] push failed:', err));
    }
    return NextResponse.json({ status: 'rejected' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/admin/claims/reject] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
