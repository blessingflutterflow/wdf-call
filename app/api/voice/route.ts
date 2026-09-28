import { NextResponse } from 'next/server';
import twilio from 'twilio';
import {
  findNumberByIdentity,
  findDidLogicDomainByIdentity,
  didLogicNumberFromDomain,
  didLogicSipCredsFromDomain,
} from '@/lib/twilio';
import { getAppSettings, resolveMaxCallMinutes } from '@/lib/settingsStore';
import { isSuspended } from '@/lib/userStatus';

// Twilio calls this route when an outbound call is initiated from the client
export async function POST(request: Request) {
  try {
    // Twilio generally sends form-encoded data, so let's handle that
    const formData = await request.formData().catch(() => null);

    // We can extract 'To' from standard form data
    const To = formData?.get('To') as string || null;
    const From = (formData?.get('From') as string) || '';

    // Caller ID = the calling user's OWN provisioned number, so the person they
    // call sees their WDF Call number (not the shared one). Falls back to the
    // shared TWILIO_PHONE_NUMBER if we can't resolve the user's number.
    let callerId = process.env.TWILIO_PHONE_NUMBER!;
    let didLogicNumber: string | null = null;
    // This number's own DIDLogic SIP account (per-user, set at claim time).
    // Falls back to the shared trunk env vars for bridges created before
    // per-user outbound trunking existed.
    let didLogicSipCreds: { username: string; password: string } | null = null;
    const identity = From.startsWith('client:') ? From.replace('client:', '') : '';
    if (identity) {
      const owned = await findNumberByIdentity(identity);
      if (owned?.phoneNumber) {
        callerId = owned.phoneNumber;
      } else {
        // Not a Twilio-native number — check the DIDLogic-bridged (landline) path.
        const domain = await findDidLogicDomainByIdentity(identity);
        const num = domain ? didLogicNumberFromDomain(domain.domainName) : null;
        if (num) {
          didLogicNumber = num;
          callerId = `+${num}`;
          didLogicSipCreds = domain ? didLogicSipCredsFromDomain(domain.voiceUrl) : null;
        }
      }
    }

    console.log(
      `[/api/voice] Outbound call → To: ${To}, callerId: ${callerId}, viaDidLogic: ${!!didLogicNumber}`
    );

    const twiml = new twilio.twiml.VoiceResponse();

    // Admin kill switch — the app's own dial pad already refuses to place
    // this call, but that's a UI gate; this is the real enforcement so it
    // can't be bypassed by an older app build or a direct API call.
    let blocked = false;
    if (identity) {
      try {
        blocked = await isSuspended(identity);
      } catch (e) {
        console.warn('[/api/voice] suspension lookup skipped:', e);
      }
    }

    if (blocked) {
      twiml.say('Your account is suspended. Please buy airtime to continue.');
    } else if (To) {
      // Admin-configurable auto-hangup — "stop it once they've spent more
      // than N minutes" — enforced by Twilio itself, not polled here.
      let timeLimit: number | undefined;
      try {
        timeLimit = resolveMaxCallMinutes(await getAppSettings());
      } catch (e) {
        console.warn('[/api/voice] call-limit lookup skipped:', e);
      }
      const dial = twiml.dial({
        callerId,
        answerOnBridge: true,
        ...(timeLimit ? { timeLimit } : {}),
      });
      // If the "To" is a client identity (not a phone number), use <Client>
      if (To.startsWith('client:')) {
        dial.client(To.replace('client:', ''));
      } else if (didLogicNumber) {
        // Landline (DIDLogic) numbers aren't Twilio-owned or Twilio-verified, so
        // Twilio would reject them as an invalid caller ID on a normal PSTN dial.
        // Instead we route the call out through DIDLogic's own SIP gateway —
        // DIDLogic originates it on their network, where the DID is real, so the
        // correct caller ID reaches the recipient natively.
        const gateway = process.env.DIDLOGIC_SIP_GATEWAY!;
        const sipUser = didLogicSipCreds?.username || process.env.DIDLOGIC_SIP_USERNAME!;
        const sipPass = didLogicSipCreds?.password || process.env.DIDLOGIC_SIP_PASSWORD!;
        const target = To.replace(/\D/g, '');
        dial.sip({ username: sipUser, password: sipPass }, `sip:${target}@${gateway}`);
      } else {
        // Otherwise it's a real phone number → dial PSTN
        dial.number(To);
      }
    } else {
      twiml.say('No destination number provided. Goodbye.');
    }

    return new NextResponse(twiml.toString(), {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (err: any) {
    console.error('[/api/voice] Error:', err.message);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('An application error occurred.');
    return new NextResponse(twiml.toString(), {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  }
}
