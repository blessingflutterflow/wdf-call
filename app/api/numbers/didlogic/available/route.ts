import { NextResponse } from 'next/server';
import { searchDidLogicNumbers } from '@/lib/didlogic';

// POST /api/numbers/didlogic/available
// Body: { city: "Pretoria" | "Cape Town" | "Johannesburg" | ... }
// Returns: { numbers: [{ phoneNumber, friendlyName, locality }] }
//
// Real South African geographic numbers (021/012/011-style) — Twilio itself
// doesn't sell these; DIDLogic does. Shaped identically to
// /api/numbers/available so the app can treat it the same way.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const city = (body.city || '').toString().trim();
    if (!city) {
      return NextResponse.json({ error: 'city is required' }, { status: 400 });
    }

    const dids = await searchDidLogicNumbers(city);
    const numbers = dids.map((d) => ({
      phoneNumber: `+${d.number}`,
      friendlyName: `+${d.number}`,
      locality: d.city,
      region: null,
    }));

    return NextResponse.json({ numbers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/numbers/didlogic/available] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
