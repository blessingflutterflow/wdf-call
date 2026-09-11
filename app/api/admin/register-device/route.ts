import { NextResponse } from 'next/server';
import { isAuthorizedAdmin } from '@/lib/adminAuth';
import { registerAdminDevice } from '@/lib/adminDevices';

// POST /api/admin/register-device
// Header: x-admin-code
// Body: { fcmToken: string }
// Called every time the Admin dashboard unlocks successfully, so this
// device starts getting "someone submitted proof of payment" pushes.
// Idempotent — registering the same token twice is a no-op.
export async function POST(request: Request) {
  if (!isAuthorizedAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const fcmToken = body.fcmToken as string | undefined;
    if (!fcmToken) {
      return NextResponse.json({ error: 'fcmToken is required' }, { status: 400 });
    }
    await registerAdminDevice(fcmToken);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/admin/register-device] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
