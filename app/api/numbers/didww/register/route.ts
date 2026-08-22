import { NextResponse } from 'next/server';
import {
  createDidwwIdentity,
  createDidwwAddress,
  uploadDidwwDocument,
  createDidwwProof,
  DIDWW_SA_PROOF_TYPES,
} from '@/lib/didww';

// POST /api/numbers/didww/register
// Body: {
//   firstName, lastName, phoneNumber (digits only, e.g. "27821234567"),
//   idDocumentType: "passport" | "national_id",
//   idDocumentBase64: string,        // the ID/passport scan
//   addressLine, cityName, postalCode,
//   utilityBillBase64: string,       // proof of address, <6 months old
// }
// Returns: { identityId, addressId, status: "pending_review" }
//
// One full KYC registration for ONE end-user (personal identity — see
// DIDWW_SA_PROOF_TYPES comment in lib/didww.ts for why personal, not
// business, is the right path for per-customer registration). Submits
// everything DIDWW needs to review and activate a number for this person:
// Identity + its ID proof, Address + its utility-bill proof. Kicks off
// their 24-48hr review; the resulting identityId/addressId get attached to
// a DID once approved (see /api/numbers/didww/claim, once that's built).
//
// The address MUST be a real address inside the target city's area code —
// confirmed by DIDWW support: one Identity+Address bundle only covers one
// city.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      firstName,
      lastName,
      phoneNumber,
      idDocumentType,
      idDocumentBase64,
      addressLine,
      cityName,
      postalCode,
      utilityBillBase64,
    } = body || {};

    const missing = [
      'firstName',
      'lastName',
      'phoneNumber',
      'idDocumentType',
      'idDocumentBase64',
      'addressLine',
      'cityName',
      'postalCode',
      'utilityBillBase64',
    ].filter((k) => !body?.[k]);
    if (missing.length) {
      return NextResponse.json(
        { error: `Missing required field(s): ${missing.join(', ')}` },
        { status: 400 }
      );
    }
    if (idDocumentType !== 'passport' && idDocumentType !== 'national_id') {
      return NextResponse.json(
        { error: 'idDocumentType must be "passport" or "national_id"' },
        { status: 400 }
      );
    }

    // 1) Identity (personal — one end-user registering under their own ID).
    const identity = await createDidwwIdentity({
      identityType: 'personal',
      firstName,
      lastName,
      phoneNumber,
    });

    // 2) ID document → uploaded, encrypted, then attached as this
    // Identity's proof.
    const idFileId = await uploadDidwwDocument(
      base64ToArrayBuffer(idDocumentBase64),
      `${idDocumentType} — ${firstName} ${lastName}`
    );
    const idProofType =
      idDocumentType === 'passport'
        ? DIDWW_SA_PROOF_TYPES.personalPassport
        : DIDWW_SA_PROOF_TYPES.personalNationalId;
    await createDidwwProof('identities', identity.id, idProofType, [idFileId]);

    // 3) Address, linked to that Identity.
    const address = await createDidwwAddress({
      identityId: identity.id,
      address: addressLine,
      cityName,
      postalCode,
    });

    // 4) Utility bill → uploaded, encrypted, attached as the Address's proof.
    const utilityFileId = await uploadDidwwDocument(
      base64ToArrayBuffer(utilityBillBase64),
      `Utility bill — ${addressLine}, ${cityName}`
    );
    await createDidwwProof(
      'addresses',
      address.id,
      DIDWW_SA_PROOF_TYPES.addressUtilityBill,
      [utilityFileId]
    );

    return NextResponse.json({
      identityId: identity.id,
      addressId: address.id,
      status: 'pending_review',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/numbers/didww/register] Error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const buf = Buffer.from(base64, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}
