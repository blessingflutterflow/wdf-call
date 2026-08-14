// DIDLogic REST API client — sources real geographic South African numbers
// (021/012/011-style, DIDLogic's "Local" number type) that Twilio itself
// doesn't sell. The number is purchased here, then bridged into Twilio via a
// dedicated SIP Domain so the app never talks to DIDLogic directly — see
// claimDidLogicNumber() in this file for the full flow.

import crypto from 'crypto';

const DIDLOGIC_BASE = 'https://app.didlogic.com';

function didlogicToken(): string {
  const token = process.env.DIDLOGIC_API_TOKEN;
  if (!token) throw new Error('DIDLOGIC_API_TOKEN is not configured');
  return token;
}

async function didlogicFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${DIDLOGIC_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${didlogicToken()}`,
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`DIDLogic returned a non-JSON response (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(data?.error || `DIDLogic request failed (${res.status})`);
  }
  return data;
}

export interface DidLogicNumber {
  id: number;
  number: string; // digits only, no '+', e.g. "27120190767"
  country: string;
  city: string;
  activation: number;
  monthly: number;
  per_minute: number;
  required_documents: string[];
}

/** Search DIDLogic's real inventory for a city (e.g. "Pretoria", "Cape Town"). */
export async function searchDidLogicNumbers(city: string): Promise<DidLogicNumber[]> {
  const params = new URLSearchParams({
    country_name_contains: 'South Africa',
    city_name_contains: city,
  });
  const data = await didlogicFetch(`/api/v2/numbers/search?${params.toString()}`);
  return (data?.dids?.dids ?? []) as DidLogicNumber[];
}

/** Purchase a specific number (digits only, no '+'). */
export async function purchaseDidLogicNumber(number: string) {
  const form = new FormData();
  form.append('did_numbers[]', number);
  const data = await didlogicFetch('/api/v2/numbers/purchase', {
    method: 'POST',
    body: form,
  });
  const purchased = data?.purchase?.purchases?.[0];
  if (!purchased) {
    const err = data?.purchase?.errors && JSON.stringify(data.purchase.errors);
    throw new Error(err || 'DIDLogic purchase returned no number');
  }
  return purchased as { id: number; number: string };
}

/**
 * Create a dedicated DIDLogic SIP account (trunk) for one landline number,
 * with that number baked in as its outbound caller ID.
 *
 * DIDLogic doesn't honor a per-call caller ID passed dynamically via Twilio's
 * <Dial callerId> — a shared trunk can only ever show one number. Each
 * landline number therefore gets its own SIP account.
 */
export async function createDidLogicSipAccount(label: string, callerId: string) {
  const password = crypto.randomBytes(18).toString('base64url').slice(0, 24);
  const form = new FormData();
  form.append('sipaccount[label]', label);
  form.append('sipaccount[password]', password);
  form.append('sipaccount[callerid]', callerId);
  form.append('sipaccount[channels_restrict]', 'true');
  form.append('sipaccount[max_channels]', '5');
  const data = await didlogicFetch('/api/v1/sipaccounts', { method: 'POST', body: form });
  const username = data?.sipaccount?.name as string | undefined;
  if (!username) throw new Error('DIDLogic SIP account creation returned no username');
  return { username, password };
}

/** All numbers this DIDLogic account currently owns (digits only). */
export async function listDidLogicPurchases(): Promise<
  { number: string; area: string; country: string }[]
> {
  const data = await didlogicFetch('/api/v1/purchases');
  return (data?.purchases ?? []) as { number: string; area: string; country: string }[];
}

/** Point a purchased DIDLogic number at a Twilio SIP Domain (`user@domain`). */
export async function setDidLogicDestination(number: string, sipUser: string, sipDomain: string) {
  const form = new FormData();
  form.append('destination[destination]', `sip:${sipUser}@${sipDomain}`);
  form.append('destination[transport]', '1'); // 1 = SIP URI
  form.append('destination[active]', 'true');
  return didlogicFetch(`/api/v1/purchases/${number}/destinations`, {
    method: 'POST',
    body: form,
  });
}
