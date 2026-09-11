import { NextResponse } from 'next/server';
import { isAuthorizedAdmin } from '@/lib/adminAuth';
import { getClaim } from '@/lib/claimStore';
import { readProof } from '@/lib/proofStorage';

// GET /api/admin/claims/[uid]/proof
// Header: x-admin-code
// Streams the requester's uploaded proof-of-payment image back — never
// exposed publicly, only through this PIN-gated proxy.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ uid: string }> }
) {
  if (!isAuthorizedAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { uid } = await params;
  try {
    const claim = await getClaim(uid);
    if (!claim?.proofPath) {
      return NextResponse.json({ error: 'No proof uploaded' }, { status: 404 });
    }
    const { bytes, contentType } = await readProof(claim.proofPath);
    return new NextResponse(bytes, {
      status: 200,
      headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=60' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/admin/claims/proof] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
