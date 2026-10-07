import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { twilioClient } from '@/lib/twilio';
import { findDidwwOwnerByNumber } from '@/lib/didww';
import { getAppSettings, resolveMaxCallMinutes } from '@/lib/settingsStore';

// POST /api/voice/inbound
// Twilio hits this when someone calls a user's WDF Call number. We route the
// call to that user's app via <Dial><Client>uid</Client></Dial>.
//
// Owner resolution, in order:
//  1. ?owner= on the voiceUrl (only ever set for Twilio-native numbers,
//     which had a per-number voiceUrl at claim time).
//  2. Twilio IncomingPhoneNumber.friendlyName (Twilio-native numbers).
//  3. DIDWW: all DIDWW numbers share ONE inbound trunk -> ONE voiceUrl (this
//     route), so there's no per-number URL to embed an owner in. Instead
//     the owner is tagged on the DID itself via `description` at claim
//     time (see assignDidwwTrunkAndOwner()) and read back here.
export async function POST(request: Request) {
  const twiml = new twilio.twiml.VoiceResponse();
  try {
    const url = new URL(request.url);
    let owner = url.searchParams.get('owner');

    const formData = await request.formData().catch(() => null);
    const to = (formData?.get('To') as string) || '';
    const from = (formData?.get('From') as string) || '';

    if (!owner && to) {
      const client = twilioClient();
      const list = await client.incomingPhoneNumbers.list({
        phoneNumber: to,
        limit: 1,
      });
      owner = list[0]?.friendlyName || null;
    }

    if (!owner && to) {
      owner = await findDidwwOwnerByNumber(to.replace(/^\+/, ''));
    }

    if (owner) {
      // Admin-configurable auto-hangup — "stop it once they've spent more
      // than N minutes" — enforced by Twilio itself, not polled here.
      let timeLimit: number | undefined;
      try {
        timeLimit = resolveMaxCallMinutes(await getAppSettings());
      } catch (e) {
        console.warn('[/api/voice/inbound] call-limit lookup skipped:', e);
      }
      const origin = process.env.PUBLIC_BASE_URL || url.origin;
      const recordingCallback = `${origin}/api/voice/recording-complete?identity=${encodeURIComponent(
        owner
      )}&direction=inbound&otherParty=${encodeURIComponent(from)}`;
      const dial = twiml.dial({
        answerOnBridge: true,
        timeout: 30,
        ...(timeLimit ? { timeLimit } : {}),
        // AI call-summary feature — see lib/callLogStore.ts and
        // app/api/voice/recording-complete for what happens with this.
        record: 'record-from-answer-dual',
        recordingStatusCallback: recordingCallback,
        recordingStatusCallbackEvent: ['completed'],
      });
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
