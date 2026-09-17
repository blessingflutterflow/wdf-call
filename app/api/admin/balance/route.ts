import { NextResponse } from 'next/server';
import { isAuthorizedAdmin } from '@/lib/adminAuth';
import { twilioClient } from '@/lib/twilio';

// GET /api/admin/balance
// Header: x-admin-code
// Returns the current Twilio account balance — useful for deciding whether
// a top-up is needed before approving a request.
export async function GET(request: Request) {
  if (!isAuthorizedAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const balance = await twilioClient().balance.fetch();
    return NextResponse.json({ balance: balance.balance, currency: balance.currency });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/admin/balance] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
