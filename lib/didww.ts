// DIDWW REST API (v3, JSON:API) client — sources real geographic South
// African numbers across DIDWW's full coverage: Bloemfontein, Cape Town,
// Durban, East London, George, Johannesburg (both the 011 and 010 groups),
// Kimberley, Klerksdorp, Middelburg, Pietermaritzburg, Polokwane, Port
// Elizabeth, Pretoria, Rustenburg — 15 cities, confirmed live against the
// real account, versus DIDLogic's 4. Replaces lib/didlogic.ts.
//
// Numbers are purchased here, then (once we own one) bridged into Twilio
// via a dedicated SIP Domain + trunk, the same overall shape as the
// DIDLogic integration it replaces.
//
// Everything below marked "confirmed live" was validated against the real
// DIDWW API during integration (request shapes accepted, only rejected on
// account state like balance/feature flags — never on malformed requests).
// Anything not yet confirmed live is marked TODO and should be verified
// once the account is funded and owns a real DID.

const DIDWW_BASE = 'https://api.didww.com/v3';

function didwwKey(): string {
  const key = process.env.DIDWW_API_KEY;
  if (!key) throw new Error('DIDWW_API_KEY is not configured');
  return key;
}

async function didwwFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${DIDWW_BASE}${path}`, {
    ...init,
    headers: {
      'Api-Key': didwwKey(),
      'Content-Type': 'application/vnd.api+json',
      Accept: 'application/vnd.api+json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`DIDWW returned a non-JSON response (${res.status})`);
  }
  if (!res.ok) {
    const detail = Array.isArray(data?.errors)
      ? data.errors.map((e: any) => e.detail || e.title).join('; ')
      : undefined;
    throw new Error(detail || `DIDWW request failed (${res.status})`);
  }
  return data;
}

/** South Africa's DIDWW country id — confirmed live, static. */
export const DIDWW_SOUTH_AFRICA_COUNTRY_ID = 'ef78ccfe-e33e-4488-9c3e-e0e7981960d7';

/**
 * DID Group ids for every South African *local* (geographic) city DIDWW
 * covers — confirmed live via GET /v3/did_groups, filtered to real
 * geographic groups only (excludes the separate Mobile/National/Toll-free
 * groups DIDWW also lists, which aren't what this product sells).
 *
 * Johannesburg has two distinct groups (011 and the newer 010 range) —
 * both included since either is a legitimate Johannesburg number.
 */
export const DIDWW_SOUTH_AFRICA_CITIES: Record<string, string> = {
  Bloemfontein: '982389b9-40c9-437f-9afe-f538b73ec405',
  'Cape Town': 'f5611ba7-25d2-41fe-bae6-1ff7b85ebea3',
  Durban: '9df185af-9707-4148-aa0d-2ff57a811939',
  'East London': 'c390ae33-276f-484b-9d03-c00cad2fb90a',
  George: 'a5950d8e-5d08-48e6-bbe7-97db67f60f10',
  Johannesburg: 'e4f84d1f-aa9b-44bb-b150-4cd28c812f21', // 011
  'Johannesburg (010)': '3d68a4d6-7de1-4931-9949-060f2e48d3b0',
  Kimberley: '294bca51-8278-4bbd-aa4e-b6bfca29317b',
  Klerksdorp: '60ea7fa1-29d8-406a-a3bc-92ad27d7aac5',
  Middelburg: '6ac97e67-c589-4a25-a360-574a4f2b89a2',
  Pietermaritzburg: '1c9feba0-75b0-4b38-bea4-7f1c5456d2b4',
  Polokwane: 'ca678809-15db-4113-99e4-03db901c1dba',
  'Port Elizabeth': '39289a03-9c55-4395-8856-36253760c3b7',
  Pretoria: 'a01ea786-5a54-4f0f-ae08-877f337fb3bc',
  Rustenburg: '2ccb9b02-d241-4444-9367-007afd0e3db4',
};

export interface DidwwSku {
  id: string;
  setupPrice: number;
  monthlyPrice: number;
  channelsIncluded: number;
}

export interface DidwwGroupInfo {
  didGroupId: string;
  city: string;
  prefix: string;
  isAvailable: boolean;
  totalCount: number;
  /**
   * Whether this account can browse/pick specific individual numbers via
   * GET /v3/available_dids. Currently `false` account-wide — DIDWW gates
   * this behind account verification + funding (confirmed with their
   * support). Until it flips to true, use orderDidwwNumbers() instead:
   * DIDWW auto-assigns from stock rather than letting the caller pick.
   */
  availableDidsEnabled: boolean;
  needsRegistration: boolean;
  skus: DidwwSku[];
}

/** Look up a city's current stock, feature flags, and pricing SKUs. */
export async function getDidwwGroupInfo(didGroupId: string): Promise<DidwwGroupInfo> {
  const data = await didwwFetch(`/did_groups/${didGroupId}?include=stock_keeping_units`);
  const g = data.data;
  const skus: DidwwSku[] = (data.included || [])
    .filter((i: any) => i.type === 'stock_keeping_units')
    .map((s: any) => ({
      id: s.id,
      setupPrice: Number(s.attributes.setup_price),
      monthlyPrice: Number(s.attributes.monthly_price),
      channelsIncluded: s.attributes.channels_included_count,
    }));
  return {
    didGroupId: g.id,
    city: g.attributes.area_name,
    prefix: g.attributes.prefix,
    isAvailable: g.meta.is_available,
    totalCount: g.meta.total_count,
    availableDidsEnabled: g.meta.available_dids_enabled,
    needsRegistration: g.meta.needs_registration,
    skus,
  };
}

/**
 * Specific, individually-pickable numbers in a group. Requires
 * `available_dids_enabled` on the account — will 403 until DIDWW turns
 * that on (see DidwwGroupInfo.availableDidsEnabled). Prefer
 * orderDidwwNumbers() until then.
 */
export async function listAvailableDids(didGroupId: string, limit = 20) {
  const data = await didwwFetch(
    `/available_dids?filter[did_group_id]=${didGroupId}&page[size]=${limit}`
  );
  return (data.data || []).map((d: any) => ({ id: d.id, number: d.attributes.number }));
}

export interface DidwwOrderResult {
  orderId: string;
  reference: string;
  status: string;
  amount: number;
}

/**
 * Bulk/single order — N numbers from one SKU (one city + channel tier).
 * Confirmed live: request shape validated against the real API — a live
 * order attempt was rejected only with "Insufficient balance"
 * (available_balance: 0, total_cost matching the SKU's price), never as a
 * malformed request. Will succeed once the account is funded.
 */
export async function orderDidwwNumbers(
  skuId: string,
  qty: number,
  allowBackOrdering = true
): Promise<DidwwOrderResult> {
  const data = await didwwFetch('/orders', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'orders',
        attributes: {
          allow_back_ordering: allowBackOrdering,
          items: [{ type: 'did_order_items', attributes: { qty, sku_id: skuId } }],
        },
      },
    }),
  });
  const o = data.data;
  return {
    orderId: o.id,
    reference: o.attributes.reference,
    status: o.attributes.status,
    amount: Number(o.attributes.amount),
  };
}

/**
 * Fetch an order's current status. TODO: confirm the exact shape of the
 * resulting DIDs once a real order clears (not yet testable without
 * funds) — likely either included here or via listDidwwDids() filtered by
 * order/created_at afterward.
 */
export async function getDidwwOrder(orderId: string) {
  return didwwFetch(`/orders/${orderId}`);
}

/** All DIDs currently owned by this account (paginated). */
export async function listDidwwDids(limit = 100) {
  const data = await didwwFetch(`/dids?page[size]=${limit}`);
  return (data.data || []).map((d: any) => ({
    id: d.id,
    number: d.attributes.number,
    status: d.attributes.status,
  }));
}

// ── Identities & Addresses (KYC / registration) ─────────────────────────
//
// South African local numbers require a Business Identity (rep name,
// phone, company name) + an Address that matches the DID's *specific*
// area code — confirmed with DIDWW support: one Identity+Address bundle
// only covers ONE city. A Cape Town number needs a Cape Town address, a
// Durban number needs a Durban address, even reusing the same company
// Identity across both. Once verified, reusing that exact (unmodified)
// Identity+Address on further numbers IN THAT SAME CITY is instant — no
// repeat review. Editing it, or attaching it to a different city's
// number, both trigger a fresh 24-48hr review.

export interface DidwwIdentityInput {
  firstName: string;
  lastName: string;
  /** Digits only, no '+' — confirmed live (a leading '+' is rejected). */
  phoneNumber: string;
  companyName: string;
  companyRegNumber?: string;
  contactEmail?: string;
}

/** Create a Business Identity. Confirmed live: required field set is
 * exactly first_name, last_name, phone_number, identity_type="business",
 * company_name. */
export async function createDidwwIdentity(input: DidwwIdentityInput) {
  const data = await didwwFetch('/identities', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'identities',
        attributes: {
          identity_type: 'business',
          first_name: input.firstName,
          last_name: input.lastName,
          phone_number: input.phoneNumber,
          company_name: input.companyName,
          ...(input.companyRegNumber ? { company_reg_number: input.companyRegNumber } : {}),
          ...(input.contactEmail ? { contact_email: input.contactEmail } : {}),
        },
        relationships: {
          country: { data: { type: 'countries', id: DIDWW_SOUTH_AFRICA_COUNTRY_ID } },
        },
      },
    }),
  });
  return data.data;
}

export interface DidwwAddressInput {
  identityId: string;
  /** Street + building number. Must be a real address inside the target
   * city's area code. */
  address: string;
  cityName: string;
  postalCode: string;
}

/** Create an Address linked to an Identity. Confirmed live required
 * fields: address, city_name, postal_code, plus identity + country
 * relationships. */
export async function createDidwwAddress(input: DidwwAddressInput) {
  const data = await didwwFetch('/addresses', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'addresses',
        attributes: {
          address: input.address,
          city_name: input.cityName,
          postal_code: input.postalCode,
        },
        relationships: {
          identity: { data: { type: 'identities', id: input.identityId } },
          country: { data: { type: 'countries', id: DIDWW_SOUTH_AFRICA_COUNTRY_ID } },
        },
      },
    }),
  });
  return data.data;
}

// ── Twilio bridge (trunk) ────────────────────────────────────────────────
//
// TODO: not yet live-tested — the account doesn't own a real DID yet to
// attach a trunk to. Designed from DIDWW's documented Trunk resource
// (POST /v3/trunks) and their Twilio BYOC integration guide. Plays the
// same role createDidLogicSipAccount() + setDidLogicDestination() played
// for DIDLogic: point this number's inbound calls at our Twilio SIP
// domain. Verify field names once a real DID exists to test against.

export interface DidwwTrunkInput {
  name: string;
  /** Our Twilio SIP domain, e.g. wdf-did-<number>.sip.twilio.com */
  host: string;
  port?: number;
}

export async function createDidwwTrunk(input: DidwwTrunkInput) {
  const data = await didwwFetch('/trunks', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'trunks',
        attributes: {
          name: input.name,
          priority: 1,
          weight: 65535,
          ringing_timeout: 30,
          cli_format: 'e164',
          configuration: {
            type: 'sip_configurations',
            attributes: {
              host: input.host,
              port: input.port ?? 5060,
              transport_protocol_id: 2, // UDP
            },
          },
        },
      },
    }),
  });
  return data.data;
}
