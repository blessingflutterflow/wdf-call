import { NextResponse } from 'next/server';
import { isAuthorizedAdmin } from '@/lib/adminAuth';
import { listOpenClaims } from '@/lib/claimStore';

// GET /api/admin/claims
// Header: x-admin-code
// Returns: { claims: (ClaimRecord & { uid, email })[] }
// Every open request (pending/seen/processing) — not just brand new ones,
// so the dashboard keeps showing something while it's being worked.
//
// Polled by the in-app admin screen every few seconds — this is what makes
// the dashboard feel "live" without standing up websockets under a deadline.
export async function GET(request: Request) {
  if (!isAuthorizedAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const claims = await listOpenClaims();
    return NextResponse.json({ claims });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/admin/claims] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
