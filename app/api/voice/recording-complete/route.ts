import { NextResponse } from 'next/server';
import { submitRecordingForTranscription } from '@/lib/twilioTranscription';
import { saveCallLog, saveTranscriptionPointer } from '@/lib/callLogStore';

// Twilio calls this (recordingStatusCallback from the <Dial> in /api/voice
// and /api/voice/inbound) once a call's recording is ready. We kick off
// transcription against it immediately — the actual transcript text arrives
// later via /api/voice/transcription-complete.
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const identity = url.searchParams.get('identity') || '';
    const direction = (url.searchParams.get('direction') as 'outbound' | 'inbound') || 'outbound';
    const otherParty = url.searchParams.get('otherParty') || undefined;

    const formData = await request.formData().catch(() => null);
    const callSid = (formData?.get('CallSid') as string) || '';
    const recordingSid = (formData?.get('RecordingSid') as string) || '';
    const recordingUrl = (formData?.get('RecordingUrl') as string) || undefined;
    const recordingStatus = (formData?.get('RecordingStatus') as string) || '';
    const durationStr = formData?.get('RecordingDuration') as string | null;
    const recordingDuration = durationStr ? Number(durationStr) : undefined;

    if (!identity || !callSid || !recordingSid) {
      console.warn('[/api/voice/recording-complete] Missing identity/callSid/recordingSid', {
        identity,
        callSid,
        recordingSid,
      });
      return NextResponse.json({ ok: true }); // nothing useful to do — don't make Twilio retry forever
    }

    if (recordingStatus !== 'completed') {
      console.warn('[/api/voice/recording-complete] Non-completed status:', recordingStatus);
      return NextResponse.json({ ok: true });
    }

    const configId = process.env.TWILIO_TRANSCRIPTION_CONFIG_ID;
    if (!configId) {
      // Feature not set up yet (see /api/admin/setup/transcription-config) —
      // still keep the recording on record rather than silently dropping it.
      await saveCallLog({
        callSid,
        identity,
        direction,
        otherParty,
        recordingSid,
        recordingUrl,
        recordingDuration,
        status: 'failed',
        error: 'TWILIO_TRANSCRIPTION_CONFIG_ID not configured',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return NextResponse.json({ ok: true });
    }

    await saveCallLog({
      callSid,
      identity,
      direction,
      otherParty,
      recordingSid,
      recordingUrl,
      recordingDuration,
      status: 'transcribing',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    try {
      const transcription = await submitRecordingForTranscription(recordingSid, configId);
      await saveTranscriptionPointer(transcription.id, { identity, callSid });
      await saveCallLog({
        callSid,
        identity,
        direction,
        otherParty,
        recordingSid,
        recordingUrl,
        recordingDuration,
        transcriptionId: transcription.id,
        status: 'transcribing',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.error('[/api/voice/recording-complete] Transcription submit failed:', e);
      await saveCallLog({
        callSid,
        identity,
        direction,
        otherParty,
        recordingSid,
        recordingUrl,
        recordingDuration,
        status: 'failed',
        error: e instanceof Error ? e.message : 'Unknown transcription submit error',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/voice/recording-complete] Error:', message);
    return NextResponse.json({ ok: true }); // always 2xx so Twilio doesn't retry-storm
  }
}
