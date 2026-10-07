import { NextResponse } from 'next/server';
import { listCallLogs } from '@/lib/callLogStore';

// GET /api/calls/mine?identity=<uid>
// This user's own call history with AI summaries.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const identity = url.searchParams.get('identity');
    if (!identity) {
      return NextResponse.json({ error: 'identity is required' }, { status: 400 });
    }
    const calls = await listCallLogs(identity);
    return NextResponse.json({ calls });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/calls/mine] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
