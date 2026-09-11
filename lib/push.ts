import { getGoogleAccessToken, projectId } from '@/lib/googleAuth';

/**
 * Sends an FCM notification directly via the HTTP v1 API. Best-effort — the
 * one caller (approve/route.ts) already treats a failure here as non-fatal,
 * since the approval itself must never be undone by a notification hiccup.
 */
export async function sendPushNotification(
  fcmToken: string,
  title: string,
  body: string
): Promise<void> {
  const accessToken = await getGoogleAccessToken([
    'https://www.googleapis.com/auth/firebase.messaging',
  ]);

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId()}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          notification: { title, body },
        },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`FCM send failed (${res.status}): ${await res.text()}`);
  }
}
