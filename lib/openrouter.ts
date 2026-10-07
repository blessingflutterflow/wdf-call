// OpenRouter — transcribes (Whisper) and summarizes (GLM-5.3) call
// recordings. Twilio's own Batch Transcription API needs the account to
// accept their AI/ML features addendum first (blocked — see git history),
// so transcription happens here instead: plain Twilio call recording (no
// addendum needed) -> download the audio -> Whisper via OpenRouter ->
// GLM-5.3 via OpenRouter for the summary. Same OpenRouter key for both
// steps, no extra vendor.

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const SUMMARY_MODEL = 'z-ai/glm-5.3';
const TRANSCRIBE_MODEL = 'openai/whisper-1';

function openrouterApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');
  return apiKey;
}

/** Transcribes a call recording. audioBytes is the raw file (e.g. mp3) from Twilio. */
export async function transcribeAudio(audioBytes: Buffer, filename: string): Promise<string> {
  const form = new FormData();
  form.append('model', TRANSCRIBE_MODEL);
  form.append('file', new Blob([new Uint8Array(audioBytes)]), filename);

  const res = await fetch(`${OPENROUTER_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openrouterApiKey()}`,
      'HTTP-Referer': 'https://wdf-call.vercel.app',
      'X-Title': 'Nosh Call Summaries',
    },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`OpenRouter transcription failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { text?: string };
  const text = data.text?.trim();
  if (!text) throw new Error('OpenRouter returned an empty transcript');
  return text;
}

export async function summarizeCallTranscript(transcript: string): Promise<string> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openrouterApiKey()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://wdf-call.vercel.app',
      'X-Title': 'Nosh Call Summaries',
    },
    body: JSON.stringify({
      model: SUMMARY_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You summarize phone call transcripts for a call log entry. ' +
            'Write 2-4 plain sentences: who called, what it was about, and ' +
            'any action items or follow-up needed. No headers, no bullet ' +
            'points, no preamble like "This call was about" — just the summary.',
        },
        { role: 'user', content: transcript },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter request failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const summary = data.choices?.[0]?.message?.content?.trim();
  if (!summary) throw new Error('OpenRouter returned no summary content');
  return summary;
}
