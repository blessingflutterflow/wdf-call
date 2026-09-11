import { NextResponse } from 'next/server';
import { isAuthorizedAdmin } from '@/lib/adminAuth';
import { getClaim, setClaim } from '@/lib/claimStore';
import { sendPushNotification } from '@/lib/push';

// POST /api/admin/claims/[uid]/seen
// Header: x-admin-code
// Marks that an admin has looked at the proof of payment — no money moves.
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
    await setClaim(uid, { ...claim, status: 'seen', updatedAt: Date.now() });
    if (claim.fcmToken) {
      sendPushNotification(
        claim.fcmToken,
        'Payment received',
        `We've got your proof of payment for ${claim.phoneNumber} — reviewing now.`
      ).catch((err) => console.warn('[claims/seen] push failed:', err));
    }
    return NextResponse.json({ status: 'seen' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/admin/claims/seen] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
