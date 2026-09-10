import { NextResponse } from 'next/server';
import { twilioClient, findNumberByIdentity } from '@/lib/twilio';

// POST /api/numbers/claim
// Body: { identity: string, phoneNumber: string, country?: string,
//         numberType?: "mobile"|"local" }
// Returns: { phoneNumber, sid, reused? }
//
// Purchases the chosen number, tags it with the owner (friendlyName = uid),
// and points its inbound voice webhook at /api/voice/inbound so calls ring
// the owner's app. Idempotent: a user who already has a number gets it back.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = body.identity as string | undefined;
    const phoneNumber = body.phoneNumber as string | undefined;
    const numberType = body.numberType === 'local' ? 'local' : 'mobile';

    if (!identity || !phoneNumber) {
      return NextResponse.json(
        { error: 'identity and phoneNumber are required' },
        { status: 400 }
      );
    }

    const client = twilioClient();

    // One number per user — return the existing one instead of buying again.
    const existing = await findNumberByIdentity(identity);
    if (existing) {
      return NextResponse.json({
        phoneNumber: existing.phoneNumber,
        sid: existing.sid,
        reused: true,
      });
    }

    // Inbound webhook carries the owner so routing needs no DB lookup.
    const origin = process.env.PUBLIC_BASE_URL || new URL(request.url).origin;
    const voiceUrl = `${origin}/api/voice/inbound?owner=${encodeURIComponent(identity)}`;

    // Regulated countries (e.g. ZA) require an approved bundle + address, and
    // the regulation type has to MATCH the number.
    //
    // ⚠️ ZA quirk: the numbers Twilio returns under AvailablePhoneNumbers/ZA/
    // Local are the 087 range, which in South Africa's numbering plan is the
    // *National* non-geographic range — Twilio rejects them against a "Local -
    // Business" bundle ("bundle type does not have correct regulation to
    // provision this number") and needs the "National - Business" one. So the
    // app's "Landline" tab (numberType 'local') maps to the NATIONAL bundle
    // here. TWILIO_BUNDLE_SID_LOCAL is kept as a fallback for the day Twilio
    // actually stocks geographic ZA locals.
    const bundleSid =
      (numberType === 'local'
        ? process.env.TWILIO_BUNDLE_SID_NATIONAL ||
          process.env.TWILIO_BUNDLE_SID_LOCAL
        : process.env.TWILIO_BUNDLE_SID) || undefined;
    const addressSid =
      (numberType === 'local'
        ? process.env.TWILIO_ADDRESS_SID_NATIONAL ||
          process.env.TWILIO_ADDRESS_SID_LOCAL
        : process.env.TWILIO_ADDRESS_SID) || undefined;

    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber,
      friendlyName: identity, // ← owner stored here
      voiceUrl,
      voiceMethod: 'POST',
      ...(bundleSid ? { bundleSid } : {}),
      ...(addressSid ? { addressSid } : {}),
    });

    return NextResponse.json({
      phoneNumber: purchased.phoneNumber,
      sid: purchased.sid,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/numbers/claim] Error:', message);
    // 400 so the app can show Twilio's reason (taken, regulatory bundle, etc.)
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
