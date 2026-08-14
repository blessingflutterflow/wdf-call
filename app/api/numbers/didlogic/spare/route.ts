import { NextResponse } from 'next/server';
import { listDidLogicPurchases } from '@/lib/didlogic';
import { listBridgedDidLogicNumbers } from '@/lib/twilio';

// POST /api/numbers/didlogic/spare
// Returns already-purchased DIDLogic numbers that aren't bridged to any user
// yet (early proof-of-concept purchases, orphaned retries) — lets a claim use
// paid-for inventory instead of buying a fresh number.
//
// The DIDLogic account (and its purchased-number inventory) is shared with
// RingaMo, so "bridged" here checks BOTH products' Twilio domain namespaces
// (see didLogicNumberFromDomain) — otherwise this could offer a number
// RingaMo already has bridged to one of its own users.
export async function POST() {
  try {
    const [purchases, bridged] = await Promise.all([
      listDidLogicPurchases(),
      listBridgedDidLogicNumbers(),
    ]);
    const spare = purchases.filter((p) => !bridged.has(p.number));
    return NextResponse.json({
      numbers: spare.map((p) => ({
        phoneNumber: `+${p.number}`,
        friendlyName: `+${p.number}`,
        locality: p.area,
        region: null,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/numbers/didlogic/spare] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
