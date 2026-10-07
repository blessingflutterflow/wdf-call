import { getGoogleAccessToken } from '@/lib/googleAuth';

// Call recordings/transcripts/summaries — one JSON blob per call, in the same
// Cloud Storage bucket as proof-of-payment images (see lib/proofStorage.ts).
// Not a fit for Firebase Auth custom claims (lib/claimStore.ts's usual trick)
// since transcripts can run well past that field's ~1000-byte budget, and
// this is a growing per-user list rather than one small blob to overwrite.

const BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!;
const SCOPES = ['https://www.googleapis.com/auth/devstorage.read_write'];

export type CallLogStatus = 'recording' | 'transcribing' | 'summarizing' | 'done' | 'failed';

export interface CallLogRecord {
  callSid: string;
  identity: string;
  direction: 'outbound' | 'inbound';
  otherParty?: string; // the number dialed (outbound) or the caller's number (inbound)
  recordingSid?: string;
  recordingUrl?: string;
  recordingDuration?: number;
  transcriptionId?: string;
  transcript?: string;
  summary?: string;
  status: CallLogStatus;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

function objectPath(identity: string, callSid: string): string {
  return `calls/${identity}/${callSid}.json`;
}

async function storageFetch(path: string, init: RequestInit = {}) {
  const accessToken = await getGoogleAccessToken(SCOPES);
  return fetch(`https://storage.googleapis.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
  });
}

export async function saveCallLog(record: CallLogRecord): Promise<void> {
  const path = objectPath(record.identity, record.callSid);
  const res = await storageFetch(
    `/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    }
  );
  if (!res.ok) throw new Error(`Call log save failed (${res.status}): ${await res.text()}`);
}

/** Merge-update: reads the existing record (if any) and writes it back with these fields applied. */
export async function updateCallLog(
  identity: string,
  callSid: string,
  patch: Partial<CallLogRecord>
): Promise<CallLogRecord> {
  const existing = await getCallLog(identity, callSid);
  const merged: CallLogRecord = {
    callSid,
    identity,
    direction: 'outbound',
    status: 'recording',
    createdAt: Date.now(),
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  };
  await saveCallLog(merged);
  return merged;
}

export async function getCallLog(identity: string, callSid: string): Promise<CallLogRecord | null> {
  const path = objectPath(identity, callSid);
  const res = await storageFetch(`/storage/v1/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Call log read failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function fetchObjectsByPrefix(prefix: string): Promise<CallLogRecord[]> {
  const res = await storageFetch(
    `/storage/v1/b/${BUCKET}/o?prefix=${encodeURIComponent(prefix)}`
  );
  if (!res.ok) throw new Error(`Call log list failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { items?: { name: string }[] };
  const items = data.items ?? [];
  const records = await Promise.all(
    items.map(async (item) => {
      const r = await storageFetch(
        `/storage/v1/b/${BUCKET}/o/${encodeURIComponent(item.name)}?alt=media`
      );
      return (await r.json()) as CallLogRecord;
    })
  );
  return records.sort((a, b) => b.createdAt - a.createdAt);
}

export async function listCallLogs(identity: string): Promise<CallLogRecord[]> {
  return fetchObjectsByPrefix(`calls/${identity}/`);
}

export async function listAllCallLogs(): Promise<CallLogRecord[]> {
  return fetchObjectsByPrefix('calls/');
}

// The transcriptionStatusCallback webhook is configured once on the shared
// Configuration (see lib/twilioTranscription.ts), not per-request, so its
// payload has no room for us to pass identity/callSid through like the
// recording-complete callback does via query string. This pointer, written
// right after submitting a recording for transcription, is how
// transcription-complete finds its way back to the right call log.
interface TranscriptionPointer {
  identity: string;
  callSid: string;
}

function pointerPath(transcriptionId: string): string {
  return `calls/_transcriptionIndex/${transcriptionId}.json`;
}

export async function saveTranscriptionPointer(
  transcriptionId: string,
  pointer: TranscriptionPointer
): Promise<void> {
  const res = await storageFetch(
    `/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(
      pointerPath(transcriptionId)
    )}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pointer),
    }
  );
  if (!res.ok) throw new Error(`Transcription pointer save failed (${res.status}): ${await res.text()}`);
}

export async function getTranscriptionPointer(
  transcriptionId: string
): Promise<TranscriptionPointer | null> {
  const res = await storageFetch(
    `/storage/v1/b/${BUCKET}/o/${encodeURIComponent(pointerPath(transcriptionId))}?alt=media`
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Transcription pointer read failed (${res.status}): ${await res.text()}`);
  return res.json();
}
