import { NextResponse } from 'next/server';
import { isAuthorizedAdmin } from '@/lib/adminAuth';
import { listAllCallLogs, listCallLogs } from '@/lib/callLogStore';

// GET /api/admin/calls[?identity=<uid>]
// Header: x-admin-code
// All call logs with AI summaries, or one user's if ?identity= is given.
export async function GET(request: Request) {
  if (!isAuthorizedAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const identity = url.searchParams.get('identity');
    const calls = identity ? await listCallLogs(identity) : await listAllCallLogs();
    return NextResponse.json({ calls });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/admin/calls] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
