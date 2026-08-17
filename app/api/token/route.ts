import { NextResponse } from 'next/server';
import twilio from 'twilio';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = body.identity || 'wdf_user';

    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    // pushCredentialSid tells Twilio which FCM/APNs credential to use when
    // waking the device for an incoming call. Without it, incoming calls
    // never reach the app — registration succeeds, outbound calls work, but
    // there's no way for Twilio to know how to push-notify this device.
    // See TWILIO_PUSH_CREDENTIAL_SID_ANDROID in .env.local.example for setup.
    const pushCredentialSid = process.env.TWILIO_PUSH_CREDENTIAL_SID_ANDROID;

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
      incomingAllow: true,
      ...(pushCredentialSid ? { pushCredentialSid } : {}),
    });

    const token = new AccessToken(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_API_KEY_SID!,
      process.env.TWILIO_API_KEY_SECRET!,
      {
        identity,
        ttl: 3600, // 1 hour expiry
      }
    );

    token.addGrant(voiceGrant);

    return NextResponse.json({ token: token.toJwt(), identity });
  } catch (err: any) {
    console.error('[/api/token] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Added GET method in case you test it in browser
export async function GET(request: Request) {
  return POST(new Request(request.url, { method: 'POST', body: JSON.stringify({}) }));
}
