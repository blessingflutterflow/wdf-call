import { NextResponse } from 'next/server';
import { isAuthorizedAdmin } from '@/lib/adminAuth';
import { transcribeAudio, summarizeCallTranscript } from '@/lib/openrouter';

// GET /api/admin/debug/test-transcribe
// Header: x-admin-code
// TEMPORARY — verifies the OpenRouter Whisper + GLM-5.3 integration end to
// end against a synthesized tone (not a real call) before the first real
// call goes through the pipeline. Delete this route once that's confirmed.
function synthesizeWavTone(): Buffer {
  const sampleRate = 8000;
  const seconds = 1;
  const numSamples = sampleRate * seconds;
  const dataSize = numSamples * 2; // 16-bit mono
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5 * 32767;
    buf.writeInt16LE(Math.round(sample), 44 + i * 2);
  }
  return buf;
}

export async function GET(request: Request) {
  if (!isAuthorizedAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const wav = synthesizeWavTone();
    const transcript = await transcribeAudio(wav, 'test-tone.wav');
    const summary = await summarizeCallTranscript(
      transcript || '(Whisper returned empty text for a pure tone, as expected.)'
    );
    return NextResponse.json({ ok: true, transcript, summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/admin/debug/test-transcribe] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
