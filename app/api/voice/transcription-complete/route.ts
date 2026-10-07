import { NextResponse } from 'next/server';
import { getTranscriptionPointer, updateCallLog } from '@/lib/callLogStore';
import { summarizeCallTranscript } from '@/lib/openrouter';

// Twilio calls this (transcriptionStatusCallback, set once on the shared
// Configuration — see lib/twilioTranscription.ts's createTranscriptionConfig)
// when a submitted recording's transcript is ready. This is a brand-new API
// (GA'd days before this was written) and Twilio's docs don't fully spell
// out the webhook's JSON field names, so this parses defensively: several
// plausible shapes are tried, the raw body is always logged, and if nothing
// matches, the raw payload is stored as the transcript rather than losing it
// — that log is what the parser below should get tightened against once a
// real call has gone through.
interface Sentence {
  text?: string;
  transcript?: string;
  content?: string;
  mediaChannel?: number;
  channel?: number;
  audioChannelIndex?: number;
  speaker?: string;
}

function extractSentences(body: any): Sentence[] | null {
  const candidates = [
    body?.sentences,
    body?.transcription?.sentences,
    body?.transcript?.sentences,
    body?.results?.sentences,
    body?.results?.channels?.flatMap((c: any) => c?.sentences ?? []),
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c;
  }
  return null;
}

function sentenceText(s: Sentence): string {
  return (s.text ?? s.transcript ?? s.content ?? '').trim();
}

function sentenceSpeakerLabel(s: Sentence): string {
  if (s.speaker) return s.speaker;
  const channel = s.audioChannelIndex ?? s.mediaChannel ?? s.channel;
  if (channel === 1) return 'Customer';
  if (channel === 2) return 'Agent';
  return 'Speaker';
}

function assembleTranscript(sentences: Sentence[]): string {
  return sentences
    .map(sentenceText)
    .filter(Boolean)
    .map((text, i) => `${sentenceSpeakerLabel(sentences[i])}: ${text}`)
    .join('\n');
}

export async function POST(request: Request) {
  const rawText = await request.text().catch(() => '');
  let body: any = {};
  try {
    body = rawText ? JSON.parse(rawText) : {};
  } catch {
    // Not JSON — fall through, we still log rawText below.
  }

  console.log('[/api/voice/transcription-complete] Raw payload:', rawText.slice(0, 4000));

  try {
    const transcriptionId: string | undefined =
      body?.transcription?.id ?? body?.transcription_sid ?? body?.id;
    const status: string | undefined = body?.transcription?.status ?? body?.status;

    if (!transcriptionId) {
      console.warn('[/api/voice/transcription-complete] No transcription id in payload — see raw log above');
      return NextResponse.json({ ok: true });
    }

    const pointer = await getTranscriptionPointer(transcriptionId);
    if (!pointer) {
      console.warn('[/api/voice/transcription-complete] No pointer for transcription', transcriptionId);
      return NextResponse.json({ ok: true });
    }

    if (status && status.toUpperCase() !== 'COMPLETED') {
      await updateCallLog(pointer.identity, pointer.callSid, {
        transcriptionId,
        status: 'failed',
        error: `Transcription status: ${status}`,
      });
      return NextResponse.json({ ok: true });
    }

    const sentences = extractSentences(body);
    const transcript = sentences ? assembleTranscript(sentences) : rawText.slice(0, 8000);

    if (!transcript.trim()) {
      await updateCallLog(pointer.identity, pointer.callSid, {
        transcriptionId,
        status: 'failed',
        error: 'Empty transcript',
      });
      return NextResponse.json({ ok: true });
    }

    await updateCallLog(pointer.identity, pointer.callSid, {
      transcriptionId,
      transcript,
      status: 'summarizing',
    });

    try {
      const summary = await summarizeCallTranscript(transcript);
      await updateCallLog(pointer.identity, pointer.callSid, {
        summary,
        status: 'done',
      });
    } catch (e) {
      console.error('[/api/voice/transcription-complete] Summarize failed:', e);
      await updateCallLog(pointer.identity, pointer.callSid, {
        status: 'failed',
        error: e instanceof Error ? e.message : 'Unknown summarize error',
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/voice/transcription-complete] Error:', message);
    return NextResponse.json({ ok: true });
  }
}
