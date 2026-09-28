import { NextResponse } from 'next/server';
import { isAuthorizedAdmin } from '@/lib/adminAuth';
import { getAppSettings, setAppSettings } from '@/lib/settingsStore';

// GET/POST /api/admin/settings/call-limit
// Header: x-admin-code
// Body (POST): { maxCallMinutes: number }  (0 = no limit)
// How long any call is allowed to run before Twilio auto-hangs it up —
// applied in /api/voice (outbound) and /api/voice/inbound as <Dial
// timeLimit>, so it's enforced by Twilio itself, not a monitoring loop here.
export async function GET(request: Request) {
  if (!isAuthorizedAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const settings = await getAppSettings();
    return NextResponse.json({ maxCallMinutes: settings.maxCallMinutes ?? 5 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/admin/settings/call-limit] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorizedAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const maxCallMinutes = Number(body.maxCallMinutes);
    if (!Number.isFinite(maxCallMinutes) || maxCallMinutes < 0) {
      return NextResponse.json({ error: 'maxCallMinutes must be a number >= 0' }, { status: 400 });
    }
    const current = await getAppSettings();
    await setAppSettings({ ...current, maxCallMinutes, updatedAt: Date.now() });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/admin/settings/call-limit] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
