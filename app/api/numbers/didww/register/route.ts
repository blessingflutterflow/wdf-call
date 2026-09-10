import { NextResponse } from 'next/server';
import {
  DIDWW_SOUTH_AFRICA_CITIES,
  getDidwwGroupInfo,
  orderDidwwNumbers,
  getDidwwDidsByOrder,
  createDidwwIdentity,
  createDidwwAddress,
  uploadDidwwDocument,
  createDidwwProof,
  createDidwwAddressVerification,
  assignDidwwTrunkAndOwner,
  DIDWW_SA_PROOF_TYPES,
} from '@/lib/didww';

// POST /api/numbers/didww/register
// Body: {
//   uid,                              // Firebase uid — whose number this is
//   firstName, lastName, phoneNumber, // digits only, e.g. "27821234567"
//   idDocumentType: "passport" | "national_id",
//   idDocumentBase64: string,
//   addressLine, cityName, postalCode,
//   utilityBillBase64: string,
// }
// Returns: { number, didId, identityId, addressId, status: "pending_review" }
//
// Full real pipeline, confirmed live step-by-step against DIDWW:
//   1. Buy ONE real number in their city (real charge, happens now — not
//      after approval). DIDWW hands us whatever's in stock; the account
//      isn't approved for letting people browse/pick specific digits yet.
//   2. Create their Identity + Address, upload + attach ID and utility-bill
//      proofs (personal identity — see DIDWW_SA_PROOF_TYPES comment in
//      lib/didww.ts for why personal, not business, is right here).
//   3. createDidwwAddressVerification() — the call that actually submits
//      this Address (with its Identity) against the purchased DID and
//      kicks off DIDWW's 24-48hr human review. Confirmed live shape via
//      validation-error probing: `address` + `dids` (plural) relationships
//      — DIDWW's own example docs show a stale `identity`+`did` shape that
//      no longer matches this API version.
//   4. Assign the DID to our shared inbound trunk + tag it with the
//      owner's uid, so once DIDWW approves it, calls to this number ring
//      straight into their app with zero further action from us.
//
// The address MUST be a real address inside the target city's area code —
// confirmed by DIDWW support: one Identity+Address bundle only covers one
// city.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      uid,
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
      'uid',
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
    const didGroupId = DIDWW_SOUTH_AFRICA_CITIES[cityName];
    if (!didGroupId) {
      return NextResponse.json(
        {
          error: `Unknown city "${cityName}". Must be one of: ${Object.keys(DIDWW_SOUTH_AFRICA_CITIES).join(', ')}`,
        },
        { status: 400 }
      );
    }
    const trunkId = process.env.DIDWW_VOICE_IN_TRUNK_ID;
    if (!trunkId) {
      throw new Error('DIDWW_VOICE_IN_TRUNK_ID is not configured');
    }

    // 1) Buy one real number in their city. Cheapest SKU (lowest setup
    // price) — a single voice-in line is all this product needs.
    const group = await getDidwwGroupInfo(didGroupId);
    if (!group.skus.length) {
      throw new Error(`No SKUs available for ${cityName} right now.`);
    }
    const sku = [...group.skus].sort((a, b) => a.setupPrice - b.setupPrice)[0];
    const order = await orderDidwwNumbers(sku.id, 1);
    const dids = await getDidwwDidsByOrder(order.orderId);
    const did = dids[0];
    if (!did) {
      throw new Error(
        `Order ${order.orderId} placed but no DID came back yet — try checking again shortly.`
      );
    }

    // 2) Identity (personal — one end-user registering under their own ID).
    const identity = await createDidwwIdentity({
      identityType: 'personal',
      firstName,
      lastName,
      phoneNumber,
    });

    const idFileId = await uploadDidwwDocument(
      base64ToArrayBuffer(idDocumentBase64),
      `${idDocumentType} — ${firstName} ${lastName}`
    );
    const idProofType =
      idDocumentType === 'passport'
        ? DIDWW_SA_PROOF_TYPES.personalPassport
        : DIDWW_SA_PROOF_TYPES.personalNationalId;
    await createDidwwProof('identities', identity.id, idProofType, [idFileId]);

    const address = await createDidwwAddress({
      identityId: identity.id,
      address: addressLine,
      cityName,
      postalCode,
    });

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

    // 3) Submit this Address (+ its Identity) against the purchased DID —
    // this is what actually starts DIDWW's review.
    await createDidwwAddressVerification(address.id, [did.id]);

    // 4) Wire it to our Twilio bridge and tag the owner now, so approval
    // alone is enough to bring the number live — no further action needed.
    await assignDidwwTrunkAndOwner(did.id, trunkId, uid);

    return NextResponse.json({
      number: `+${did.number}`,
      didId: did.id,
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
