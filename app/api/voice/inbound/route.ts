import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { twilioClient } from '@/lib/twilio';

// POST /api/voice/inbound
// Twilio hits this when someone calls a user's WDF Call number. We route the
// call to that user's app via <Dial><Client>uid</Client></Dial>.
//
// The owner uid is passed as ?owner= on the number's voiceUrl (set at claim
// time); we fall back to resolving it from the dialed number's friendlyName.
export async function POST(request: Request) {
  const twiml = new twilio.twiml.VoiceResponse();
  try {
    const url = new URL(request.url);
    let owner = url.searchParams.get('owner');

    const formData = await request.formData().catch(() => null);
    const to = (formData?.get('To') as string) || '';

    if (!owner && to) {
      const client = twilioClient();
      const list = await client.incomingPhoneNumbers.list({
        phoneNumber: to,
        limit: 1,
      });
      owner = list[0]?.friendlyName || null;
    }

    if (owner) {
      const dial = twiml.dial({ answerOnBridge: true, timeout: 30 });
      dial.client(owner);
    } else {
      twiml.say('This number is not currently in service.');
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/voice/inbound] Error:', message);
    twiml.say('An application error occurred.');
  }

  return new NextResponse(twiml.toString(), {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}
