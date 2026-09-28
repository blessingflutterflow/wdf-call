import { NextResponse } from 'next/server';
import { isAuthorizedAdmin } from '@/lib/adminAuth';
import { setSuspended } from '@/lib/userStatus';

// POST /api/admin/users/[uid]/suspend
// Header: x-admin-code
// Kills their ability to call — see /api/numbers/mine (suspended flag) and
// the dialer, which disables the dial pad and shows "Buy Airtime" instead.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ uid: string }> }
) {
  if (!isAuthorizedAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { uid } = await params;
  try {
    await setSuspended(uid, true);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/admin/users/suspend] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
