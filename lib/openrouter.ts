// GLM-5.3 via OpenRouter — summarizes call transcripts. Chosen for low
// per-token cost; it's text-only, so this is only ever called with a
// transcript already in hand (see lib/twilioTranscription.ts for how that
// transcript is produced).

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const MODEL = 'z-ai/glm-5.3';

export async function summarizeCallTranscript(transcript: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://wdf-call.vercel.app',
      'X-Title': 'Nosh Call Summaries',
    },
    body: JSON.stringify({
      model: MODEL,
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
