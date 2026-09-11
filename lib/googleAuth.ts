import { createSign } from 'crypto';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

let cachedServiceAccount: ServiceAccount | null = null;
let cachedToken: { token: string; expiresAt: number } | null = null;

function serviceAccount(): ServiceAccount {
  if (cachedServiceAccount) return cachedServiceAccount;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is not configured (Firebase Admin service account key)'
    );
  }
  cachedServiceAccount = JSON.parse(raw);
  return cachedServiceAccount!;
}

export function projectId(): string {
  return serviceAccount().project_id;
}

function base64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

/**
 * Mints a short-lived Google OAuth2 access token from the service account,
 * via the standard JWT-bearer flow (self-sign a JWT with the service
 * account's private key, exchange it for a token). Hand-rolled with Node's
 * built-in `crypto` instead of `firebase-admin` / `google-auth-library`:
 * firebase-admin's Auth module pulls in jwks-rsa -> jose, whose dual
 * ESM/CJS packaging Next.js's Turbopack bundler cannot load on Vercel
 * ("ERR_REQUIRE_ESM") no matter how it's excluded from bundling. This
 * sidesteps that dependency chain entirely — see lib/claimStore.ts and
 * lib/push.ts, which call the Identity Toolkit and FCM REST APIs directly
 * using the token this returns.
 */
export async function getGoogleAccessToken(scopes: string[]): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.token;
  }

  const sa = serviceAccount();
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: scopes.join(' '),
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const signInput = `${header}.${claimSet}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signInput);
  signer.end();
  const signature = signer.sign(sa.private_key).toString('base64url');
  const jwt = `${signInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: now + data.expires_in };
  return data.access_token;
}
