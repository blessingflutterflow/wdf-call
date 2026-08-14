import { NextResponse } from 'next/server';
import {
  purchaseDidLogicNumber,
  setDidLogicDestination,
  createDidLogicSipAccount,
  listDidLogicPurchases,
} from '@/lib/didlogic';
import {
  createDidLogicBridgeDomain,
  attachDidLogicSipCreds,
  didLogicSipCredsFromDomain,
  findDidLogicDomainByIdentity,
  didLogicNumberFromDomain,
} from '@/lib/twilio';

// POST /api/numbers/didlogic/claim
// Body: { identity: string, phoneNumber: string }  (phoneNumber e.g. "+27120190767")
// Returns: { phoneNumber, reused? }
//
// Real South African geographic number (021/012/011-style), sourced from
// DIDLogic and bridged into Twilio so it behaves exactly like a native
// Twilio number to the rest of the app — no app-side changes needed.
//
// Flow: purchase the number from DIDLogic → create the Twilio SIP Domain
// bridge (this is the claim's checkpoint, see createDidLogicBridgeDomain) →
// create this number's own DIDLogic SIP account, caller ID baked in (static
// per DIDLogic account — see createDidLogicSipAccount), and attach it to the
// domain → point the DIDLogic number's destination at that domain.
//
// A previous claim that purchased a number but failed partway through is
// resumed from the domain checkpoint instead of buying a second number.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = body.identity as string | undefined;
    const phoneNumber = body.phoneNumber as string | undefined; // "+27..."

    if (!identity || !phoneNumber) {
      return NextResponse.json(
        { error: 'identity and phoneNumber are required' },
        { status: 400 }
      );
    }

    const origin = process.env.PUBLIC_BASE_URL || new URL(request.url).origin;

    // One number per user. If a domain already exists for this identity, a
    // previous claim got at least as far as purchasing — resume from there
    // (creating the SIP account / setting the destination again is cheap and
    // idempotent) rather than buying another number.
    const existingDomain = await findDidLogicDomainByIdentity(identity);
    if (existingDomain) {
      const existingNumber = didLogicNumberFromDomain(existingDomain.domainName);
      if (existingNumber) {
        let sipCreds = didLogicSipCredsFromDomain(existingDomain.voiceUrl);
        if (!sipCreds) {
          sipCreds = await createDidLogicSipAccount(
            `wdf-${existingNumber}`,
            existingNumber
          );
          await attachDidLogicSipCreds(existingDomain.sid, identity, origin, sipCreds);
        }
        await setDidLogicDestination(existingNumber, '1', existingDomain.domainName);
        return NextResponse.json({ phoneNumber: `+${existingNumber}`, reused: true });
      }
    }

    const didNumber = phoneNumber.replace(/\D/g, ''); // DIDLogic wants digits only

    // 1) Buy it from DIDLogic — unless we already own it (e.g. it's spare
    //    inventory from an earlier purchase, offered via
    //    /api/numbers/didlogic/spare instead of buying a fresh number).
    const owned = await listDidLogicPurchases();
    if (!owned.some((p) => p.number === didNumber)) {
      await purchaseDidLogicNumber(didNumber);
    }

    // 2) Create this user's dedicated Twilio SIP Domain — the checkpoint a
    //    retry resumes from if anything below fails.
    const domain = await createDidLogicBridgeDomain(identity, didNumber, origin);

    // 3) Create this number's own DIDLogic SIP account, with it baked in as
    //    the static outbound caller ID, and attach it to the domain.
    const sipCreds = await createDidLogicSipAccount(`wdf-${didNumber}`, didNumber);
    await attachDidLogicSipCreds(domain.sid, identity, origin, sipCreds);

    // 4) Tell DIDLogic to forward calls for this number into that domain.
    await setDidLogicDestination(didNumber, '1', domain.domainName);

    return NextResponse.json({ phoneNumber: `+${didNumber}` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/numbers/didlogic/claim] Error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
