import { NextResponse } from 'next/server';
import { isAuthorizedAdmin } from '@/lib/adminAuth';
import { getAppSettings, setAppSettings } from '@/lib/settingsStore';

// POST /api/admin/settings/bank-details
// Header: x-admin-code
// Body: { bankDetails: string }
// Overwrites the bank details shown to everyone requesting a number — free
// text, so the admin can format it however (bank, account name/number,
// branch code, what reference to use, etc).
export async function POST(request: Request) {
  if (!isAuthorizedAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const bankDetails = body.bankDetails as string | undefined;
    if (typeof bankDetails !== 'string') {
      return NextResponse.json({ error: 'bankDetails is required' }, { status: 400 });
    }
    await setAppSettings({ bankDetails, updatedAt: Date.now() });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/admin/settings/bank-details] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET so the admin screen can pre-fill the edit form with the current text.
export async function GET(request: Request) {
  if (!isAuthorizedAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const settings = await getAppSettings();
    return NextResponse.json({ bankDetails: settings.bankDetails });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/admin/settings/bank-details] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
