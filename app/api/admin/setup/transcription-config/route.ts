import { NextResponse } from 'next/server';
import { isAuthorizedAdmin } from '@/lib/adminAuth';
import { createTranscriptionConfig } from '@/lib/twilioTranscription';

// POST /api/admin/setup/transcription-config
// Header: x-admin-code
// One-time setup call for the AI call-summary feature — creates the reusable
// Twilio Batch Transcription Configuration every recording gets submitted
// against. Run once, then save the returned `id` as
// TWILIO_TRANSCRIPTION_CONFIG_ID in the environment. Safe to re-run (just
// creates another configuration and incurs no cost by itself), but there's
// no reason to unless the callback URL changes.
export async function POST(request: Request) {
  if (!isAuthorizedAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const origin = process.env.PUBLIC_BASE_URL || new URL(request.url).origin;
    const callbackUrl = `${origin}/api/voice/transcription-complete`;
    const config = await createTranscriptionConfig(callbackUrl);
    return NextResponse.json({ config });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/admin/setup/transcription-config] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
