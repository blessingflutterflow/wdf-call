import twilio from 'twilio';

/**
 * REST client authenticated with the Twilio API key/secret — the same
 * credentials that already mint access tokens in /api/token. No Auth Token
 * needed.
 */
export function twilioClient() {
  return twilio(
    process.env.TWILIO_API_KEY_SID!,
    process.env.TWILIO_API_KEY_SECRET!,
    { accountSid: process.env.TWILIO_ACCOUNT_SID! }
  );
}

/**
 * We store each owner's Firebase uid in their number's `friendlyName`, so
 * Twilio itself is the source of truth for the user → number mapping
 * (the web backend only has the Firebase *client* SDK, no Admin/DB).
 *
 * Returns the user's IncomingPhoneNumber, or null if they don't have one.
 */
export async function findNumberByIdentity(identity: string) {
  const client = twilioClient();
  const list = await client.incomingPhoneNumbers.list({
    friendlyName: identity,
    limit: 1,
  });
  return list[0] || null;
}

/**
 * Admin-level Twilio client (Account SID + Auth Token) — SIP Domain / IP
 * Access Control List management needs broader permissions than the API Key
 * used elsewhere for minting Voice access tokens.
 */
export function twilioAdminClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
}

/**
 * DIDLogic numbers aren't Twilio IncomingPhoneNumbers (no friendlyName to tag),
 * so each one gets its OWN dedicated Twilio SIP Domain instead — the domain's
 * FriendlyName holds the owner uid, doubling as our idempotency check.
 */
export async function findDidLogicDomainByIdentity(identity: string) {
  const client = twilioAdminClient();
  const domains = await client.sip.domains.list({ limit: 200 });
  return domains.find((d) => d.friendlyName === identity) || null;
}

/**
 * Recovers the DIDLogic number embedded in a bridge domain's name, if any.
 * New bridges this product creates always use the `wdf-did-` prefix (its own
 * namespace within the shared Twilio account), but this also recognizes
 * RingaMo's `ringamo-did-` domains — the DIDLogic number inventory is shared
 * between both products (same DIDLogic account), so [listBridgedDidLogicNumbers]
 * must see RingaMo's bridges too or it would offer an already-claimed number
 * as "spare".
 */
export function didLogicNumberFromDomain(domainName: string): string | null {
  const m = domainName.match(/^(?:wdf|ringamo)-did-(\d+)\.sip\.twilio\.com$/);
  return m ? m[1] : null;
}

/** Every DIDLogic number that already has a Twilio bridge (i.e. is in use). */
export async function listBridgedDidLogicNumbers(): Promise<Set<string>> {
  const client = twilioAdminClient();
  const domains = await client.sip.domains.list({ limit: 200 });
  const numbers = domains
    .map((d) => didLogicNumberFromDomain(d.domainName))
    .filter((n): n is string => !!n);
  return new Set(numbers);
}

function didLogicVoiceUrl(
  origin: string,
  identity: string,
  sipCreds?: { username: string; password: string }
) {
  const params = new URLSearchParams({ owner: identity });
  if (sipCreds) {
    params.set('sipUser', sipCreds.username);
    params.set('sipPass', sipCreds.password);
  }
  return `${origin}/api/voice/inbound?${params.toString()}`;
}

/**
 * Creates a new SIP Domain that bridges one DIDLogic number into Twilio:
 * Voice Authentication → our shared DIDLogic-gateways IP ACL, Voice URL →
 * our inbound webhook carrying the owner identity. The DIDLogic number
 * (digits only) is embedded in the domain name itself — DIDLogic numbers are
 * globally unique, so this doubles as our Twilio-domain uniqueness guarantee
 * and lets us recover "which number does this bridge carry" without a DB.
 *
 * Created without SIP credentials — this is the claim flow's checkpoint. If
 * the outbound SIP account step fails afterward (see attachDidLogicSipCreds),
 * a retry finds this domain via findDidLogicDomainByIdentity and resumes
 * instead of purchasing a second number for the same user.
 */
export async function createDidLogicBridgeDomain(
  identity: string,
  didLogicNumber: string,
  origin: string
) {
  const client = twilioAdminClient();
  const aclSid = process.env.TWILIO_DIDLOGIC_ACL_SID;
  if (!aclSid) throw new Error('TWILIO_DIDLOGIC_ACL_SID is not configured');

  const domainName = `wdf-did-${didLogicNumber}.sip.twilio.com`;

  const domain = await client.sip.domains.create({
    domainName,
    friendlyName: identity,
    voiceUrl: didLogicVoiceUrl(origin, identity),
    voiceMethod: 'POST',
  });

  await client.sip
    .domains(domain.sid)
    .ipAccessControlListMappings.create({ ipAccessControlListSid: aclSid });

  return domain;
}

/**
 * Attaches this number's dedicated DIDLogic SIP account credentials (see
 * createDidLogicSipAccount) to an already-created bridge domain, so the
 * outbound route can look them up later via [didLogicSipCredsFromDomain].
 */
export async function attachDidLogicSipCreds(
  domainSid: string,
  identity: string,
  origin: string,
  sipCreds: { username: string; password: string }
) {
  const client = twilioAdminClient();
  await client.sip
    .domains(domainSid)
    .update({ voiceUrl: didLogicVoiceUrl(origin, identity, sipCreds) });
}

/**
 * Deletes a bridge domain, freeing its DIDLogic number back to unbridged
 * (e.g. spare-inventory testing left it claimed by a throwaway identity).
 * Does not touch the DIDLogic-side SIP account or destination — those are
 * harmless left pointing at a deleted domain until the number is re-claimed.
 */
export async function deleteDidLogicBridgeDomain(domainSid: string) {
  const client = twilioAdminClient();
  await client.sip.domains(domainSid).remove();
}

/**
 * Recovers a bridge domain's dedicated DIDLogic SIP credentials from its
 * voice URL, if it has any (see attachDidLogicSipCreds). Returns null for
 * bridges created before per-user outbound trunking existed, or where that
 * step hasn't completed yet — callers should fall back to the shared trunk
 * env vars in the former case, or resume the claim in the latter.
 */
export function didLogicSipCredsFromDomain(voiceUrl: string) {
  try {
    const params = new URL(voiceUrl).searchParams;
    const username = params.get('sipUser');
    const password = params.get('sipPass');
    return username && password ? { username, password } : null;
  } catch {
    return null;
  }
}
