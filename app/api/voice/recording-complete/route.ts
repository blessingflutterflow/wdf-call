import { NextResponse } from 'next/server';
import { downloadRecordingAudio } from '@/lib/twilio';
import { transcribeAudio, summarizeCallTranscript } from '@/lib/openrouter';
import { saveCallLog } from '@/lib/callLogStore';

// Twilio calls this (recordingStatusCallback from the <Dial> in /api/voice
// and /api/voice/inbound) once a call's recording is ready. Runs the whole
// AI call-summary pipeline synchronously: download the audio -> Whisper
// (via OpenRouter) for the transcript -> GLM-5.3 (via OpenRouter) for the
// summary -> save. Twilio's own transcription API would need the account to
// accept their AI/ML features addendum first, so this sidesteps it entirely
// — recording itself needs no such addendum.
export async function POST(request: Request) {
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

  if (!identity || !callSid || !recordingSid || recordingStatus !== 'completed') {
    return NextResponse.json({ ok: true }); // nothing to do — don't make Twilio retry forever
  }

  const base = {
    callSid,
    identity,
    direction,
    otherParty,
    recordingSid,
    recordingUrl,
    recordingDuration,
    createdAt: Date.now(),
  };

  try {
    await saveCallLog({ ...base, status: 'transcribing', updatedAt: Date.now() });

    if (!recordingUrl) throw new Error('No RecordingUrl in callback');
    const audio = await downloadRecordingAudio(recordingUrl);
    const transcript = await transcribeAudio(audio, `${recordingSid}.mp3`);

    await saveCallLog({ ...base, transcript, status: 'summarizing', updatedAt: Date.now() });

    const summary = await summarizeCallTranscript(transcript);
    await saveCallLog({ ...base, transcript, summary, status: 'done', updatedAt: Date.now() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/voice/recording-complete] Pipeline failed:', message);
    await saveCallLog({
      ...base,
      status: 'failed',
      error: message,
      updatedAt: Date.now(),
    }).catch(() => {}); // best-effort — don't let a storage hiccup mask the original error
  }

  return NextResponse.json({ ok: true });
}
