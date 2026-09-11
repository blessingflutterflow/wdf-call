import { NextResponse } from 'next/server';
import { isAuthorizedAdmin } from '@/lib/adminAuth';
import { getClaim, setClaim } from '@/lib/claimStore';

// POST /api/admin/claims/[uid]/reject
// Header: x-admin-code
// No Twilio call here — rejecting a request never costs anything. The user
// can submit a fresh request afterward (claim/route.ts allows a new request
// once the existing one isn't 'pending').
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
    await setClaim(uid, { ...claim, status: 'rejected', updatedAt: Date.now() });
    return NextResponse.json({ status: 'rejected' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/admin/claims/reject] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
