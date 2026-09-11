import { NextResponse } from 'next/server';
import { getClaim, setClaim } from '@/lib/claimStore';
import { proofObjectPath, uploadProof } from '@/lib/proofStorage';
import { notifyAdmins } from '@/lib/adminDevices';

// POST /api/numbers/claim/proof
// Body: { identity, imageBase64, contentType }
// Uploads a photo/screenshot of the EFT for the requester's open claim.
// This — not the bare request — is what actually needs an admin's
// attention, so it's the point that pings them.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = body.identity as string | undefined;
    const imageBase64 = body.imageBase64 as string | undefined;
    const contentType = (body.contentType as string | undefined) || 'image/jpeg';

    if (!identity || !imageBase64) {
      return NextResponse.json(
        { error: 'identity and imageBase64 are required' },
        { status: 400 }
      );
    }

    const claim = await getClaim(identity);
    if (!claim) {
      return NextResponse.json({ error: 'No open request to attach proof to' }, { status: 404 });
    }

    const objectPath = proofObjectPath(identity, contentType);
    const bytes = Buffer.from(imageBase64, 'base64');
    await uploadProof(objectPath, bytes, contentType);

    await setClaim(identity, {
      ...claim,
      proofPath: objectPath,
      proofUploadedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await notifyAdmins(
      'Proof of payment received',
      `${claim.phoneNumber} — ready for review.`
    );

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/numbers/claim/proof] Error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
