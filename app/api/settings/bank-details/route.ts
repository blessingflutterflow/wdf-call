import { NextResponse } from 'next/server';
import { getAppSettings } from '@/lib/settingsStore';

// GET /api/settings/bank-details
// Public (no gate) — anyone about to pay for a number needs to see where to
// send it. Editing is separate and PIN-gated: see
// /api/admin/settings/bank-details.
export async function GET() {
  try {
    const settings = await getAppSettings();
    return NextResponse.json({ bankDetails: settings.bankDetails });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/settings/bank-details] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
