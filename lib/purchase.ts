import { twilioClient } from '@/lib/twilio';

/**
 * The actual Twilio purchase — split out of the old /api/numbers/claim so an
 * *admin approval* can trigger it too, not just a direct user request. See
 * lib/claimStore.ts for why there's now a pending step in between.
 *
 * Purchases the chosen number, tags it with the owner (friendlyName = uid),
 * and points its inbound voice webhook at /api/voice/inbound so calls ring
 * the owner's app.
 */
export async function purchaseNumberForIdentity(
  identity: string,
  phoneNumber: string,
  numberType: 'local' | 'mobile',
  origin: string
) {
  const client = twilioClient();

  // Inbound webhook carries the owner so routing needs no DB lookup.
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
      ? process.env.TWILIO_BUNDLE_SID_NATIONAL || process.env.TWILIO_BUNDLE_SID_LOCAL
      : process.env.TWILIO_BUNDLE_SID) || undefined;
  const addressSid =
    (numberType === 'local'
      ? process.env.TWILIO_ADDRESS_SID_NATIONAL || process.env.TWILIO_ADDRESS_SID_LOCAL
      : process.env.TWILIO_ADDRESS_SID) || undefined;

  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber,
    friendlyName: identity, // ← owner stored here
    voiceUrl,
    voiceMethod: 'POST',
    ...(bundleSid ? { bundleSid } : {}),
    ...(addressSid ? { addressSid } : {}),
  });

  return purchased;
}
