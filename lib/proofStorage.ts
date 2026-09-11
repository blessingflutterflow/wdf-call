import { getGoogleAccessToken } from '@/lib/googleAuth';

/**
 * Proof-of-payment images (a photo/screenshot of the EFT), uploaded from the
 * app and reviewed by an admin. Real Cloud Storage this time — the bucket
 * was only just enabled for this project (was 404ing "bucket does not
 * exist" before), unlike the small text blobs in claimStore.ts/
 * settingsStore.ts which stay on the custom-claims trick since they're each
 * well under the 1000-byte cap; a photo isn't.
 */
const BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!;
const SCOPES = ['https://www.googleapis.com/auth/devstorage.read_write'];

export function proofObjectPath(identity: string, contentType: string): string {
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  return `proofs/${identity}/${Date.now()}.${ext}`;
}

export async function uploadProof(
  objectPath: string,
  bytes: Buffer,
  contentType: string
): Promise<void> {
  const accessToken = await getGoogleAccessToken(SCOPES);
  const res = await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': contentType,
      },
      body: new Uint8Array(bytes),
    }
  );
  if (!res.ok) {
    throw new Error(`Proof upload failed (${res.status}): ${await res.text()}`);
  }
}

export async function readProof(
  objectPath: string
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const accessToken = await getGoogleAccessToken(SCOPES);
  const res = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new Error(`Could not read proof (${res.status}): ${await res.text()}`);
  }
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  return { bytes: await res.arrayBuffer(), contentType };
}
