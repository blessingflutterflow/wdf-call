import { NextResponse } from 'next/server';
import {
  findDidLogicDomainByIdentity,
  deleteDidLogicBridgeDomain,
} from '@/lib/twilio';

// POST /api/admin/didlogic/release
// Body: { adminToken: string, identity: string }
// Deletes the Twilio bridge domain for [identity], freeing its DIDLogic
// number back to unbridged/spare. Admin-only cleanup tool — not part of the
// product's user-facing flow. Protected by the DIDLogic API token as a
// shared secret since only we know it.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const adminToken = body.adminToken as string | undefined;
    const identity = body.identity as string | undefined;

    if (!adminToken || adminToken !== process.env.DIDLOGIC_API_TOKEN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    if (!identity) {
      return NextResponse.json({ error: 'identity is required' }, { status: 400 });
    }

    const domain = await findDidLogicDomainByIdentity(identity);
    if (!domain) {
      return NextResponse.json({ released: false, reason: 'no domain found' });
    }
    await deleteDidLogicBridgeDomain(domain.sid);
    return NextResponse.json({ released: true, domainName: domain.domainName });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/admin/didlogic/release] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
