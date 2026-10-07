// Twilio's newer Batch Transcription API (voice.twilio.com, GA Oct 2026) —
// NOT the deprecated per-Recording Transcriptions resource. A single reusable
// "Configuration" (created once, see createTranscriptionConfig) describes how
// to transcribe; individual recordings are then submitted against it and the
// actual transcript text arrives via webhook only — there is no GET for the
// sentence content, only for status/metadata. See
// app/api/voice/transcription-complete/route.ts for the webhook handler.

const VOICE_BASE = 'https://voice.twilio.com';

function twilioAuthHeader(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN not configured');
  return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
}

async function voiceFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${VOICE_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: twilioAuthHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Twilio voice API returned a non-JSON response (${res.status}): ${text.slice(0, 500)}`);
  }
  if (!res.ok) {
    throw new Error(`Twilio voice API request failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

/**
 * One-time setup call — see app/api/admin/setup/transcription-config. Creates
 * a reusable config that every call recording is submitted against. Save the
 * returned id as TWILIO_TRANSCRIPTION_CONFIG_ID; there's no need to call this
 * again unless the callback URL or engine choice changes.
 */
export async function createTranscriptionConfig(callbackUrl: string) {
  const data = await voiceFetch('/v2/Configurations/Transcription', {
    method: 'POST',
    body: JSON.stringify({
      unique_name: `nosh-call-summaries-${Date.now()}`,
      description: 'Nosh / WDF Call — AI call summaries (GLM-5.3 via OpenRouter)',
      configuration: {
        configurationType: 'Transcription',
        transcriptionEngine: 'twilio_managed',
        languageCode: 'en-US',
        transcriptionStatusCallback: { url: callbackUrl, method: 'POST' },
        participantDefaults: [
          { audioChannelIndex: 1, type: 'CUSTOMER' },
          { audioChannelIndex: 2, type: 'HUMAN_AGENT' },
        ],
      },
    }),
  });
  return data as { id: string; [key: string]: unknown };
}

/** Submit a completed call recording (RecordingSid) for transcription. */
export async function submitRecordingForTranscription(recordingSid: string, configId: string) {
  const data = await voiceFetch('/v3/Transcriptions', {
    method: 'POST',
    body: JSON.stringify({
      transcriptionConfigurationId: configId,
      sourceId: recordingSid,
    }),
  });
  return data as { id: string; status: string; [key: string]: unknown };
}
