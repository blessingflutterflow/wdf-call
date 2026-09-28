import { NextResponse } from 'next/server';
import { isAuthorizedAdmin } from '@/lib/adminAuth';
import { searchUsers } from '@/lib/userStatus';

// GET /api/admin/users?q=<email substring>
// Header: x-admin-code
// Looks someone up by email so the admin can suspend/unsuspend them. Empty
// q returns the first 50 users (Identity Toolkit has no server-side search).
export async function GET(request: Request) {
  if (!isAuthorizedAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const q = new URL(request.url).searchParams.get('q') || '';
    const users = await searchUsers(q);
    return NextResponse.json({ users });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/admin/users] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
