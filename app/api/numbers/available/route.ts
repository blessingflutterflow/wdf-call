import { NextResponse } from 'next/server';
import { twilioClient } from '@/lib/twilio';

// POST /api/numbers/available
// Body: { country?: "US"|"ZA"|..., areaCode?: string, contains?: string,
//         numberType?: "mobile"|"local" }
// Returns: { numbers: [{ phoneNumber, friendlyName, locality, region }] }
//
// Searching available numbers needs NO regulatory approval — it works today
// for ZA too. Only purchasing a regulated number is gated, and that gate is
// per NUMBER TYPE: "mobile" and "local" are separate Twilio regulation types,
// each needing its own approved bundle (see /api/numbers/claim).
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const country = (body.country || 'US').toString().toUpperCase();
    const numberType = body.numberType === 'local' ? 'local' : 'mobile';
    let contains = body.contains ? String(body.contains) : undefined;

    // areaCode: US/CA use Twilio's dedicated numeric areaCode filter.
    // Everywhere else (e.g. ZA landlines like 021/012/011), area codes aren't
    // a first-class Twilio search param — we translate them into a `contains`
    // pattern anchored right after the country code, e.g. "021" -> "+2721*".
    let areaCode: number | undefined;
    if ((country === 'US' || country === 'CA') && body.areaCode) {
      areaCode = Number(body.areaCode);
    } else if (body.areaCode && !contains) {
      const digits = String(body.areaCode).replace(/\D/g, '').replace(/^0+/, '');
      if (digits) {
        const countryCode = country === 'ZA' ? '27' : '';
        contains = countryCode ? `+${countryCode}${digits}*` : `${digits}*`;
      }
    }

    const client = twilioClient();
    const searchParams = { areaCode, contains, voiceEnabled: true, limit: 20 };
    const numbers =
      numberType === 'local'
        ? await client.availablePhoneNumbers(country).local.list(searchParams)
        : await client.availablePhoneNumbers(country).mobile.list(searchParams);

    const result = numbers.map((n) => ({
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName,
      locality: n.locality,
      region: n.region,
    }));

    return NextResponse.json({ numbers: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/numbers/available] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
