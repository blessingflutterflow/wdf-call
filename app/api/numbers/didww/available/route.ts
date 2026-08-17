import { NextResponse } from 'next/server';
import { DIDWW_SOUTH_AFRICA_CITIES, getDidwwGroupInfo } from '@/lib/didww';

// POST /api/numbers/didww/available
// Body: { city: "Cape Town" | "Johannesburg" | ... one of DIDWW_SOUTH_AFRICA_CITIES }
// Returns: { city, stockCount, skus, availableDidsEnabled }
//
// Reports live stock + pricing for a city. Doesn't return specific pickable
// numbers yet — that needs `available_dids_enabled` on the account, which
// DIDWW gates behind account verification + funding (confirmed with their
// support). Once that flips on, this can be extended to list real numbers
// via listAvailableDids() the same way DIDLogic's /available route did.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const city = (body.city || '').toString().trim();
    const didGroupId = DIDWW_SOUTH_AFRICA_CITIES[city];

    if (!didGroupId) {
      return NextResponse.json(
        {
          error: `Unknown city "${city}". Must be one of: ${Object.keys(DIDWW_SOUTH_AFRICA_CITIES).join(', ')}`,
        },
        { status: 400 }
      );
    }

    const info = await getDidwwGroupInfo(didGroupId);
    return NextResponse.json({
      city: info.city,
      stockCount: info.totalCount,
      isAvailable: info.isAvailable,
      availableDidsEnabled: info.availableDidsEnabled,
      skus: info.skus,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/numbers/didww/available] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET returns the full list of covered cities — used by the app to build
// the city picker without hardcoding it client-side.
export async function GET() {
  return NextResponse.json({ cities: Object.keys(DIDWW_SOUTH_AFRICA_CITIES) });
}
