import { NextResponse } from 'next/server';
import { isAuthorizedAdmin } from '@/lib/adminAuth';
import { twilioClient } from '@/lib/twilio';

// GET /api/admin/debug/usage
// Header: x-admin-code
// TEMPORARY — pulls real Twilio usage/spend by category for the last 30
// days, to ground the self-host-vs-Twilio economics discussion in actual
// numbers instead of guesses. Delete once that conversation is done.
const CATEGORIES = [
  'calls',
  'calls-outbound',
  'calls-inbound',
  'calls-client',
  'calls-sip',
  'sip-trunking-origination',
  'sip-trunking-termination',
  'phonenumbers',
  'phonenumbers-local',
];

export async function GET(request: Request) {
  if (!isAuthorizedAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const client = twilioClient();
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const results = await Promise.all(
      CATEGORIES.map(async (category) => {
        try {
          const records = await client.usage.records.list({
            category: category as any,
            startDate,
            endDate,
            limit: 5,
          });
          const totalPrice = records.reduce((sum, r) => sum + Math.abs(Number(r.price) || 0), 0);
          const totalUsage = records.reduce((sum, r) => sum + Number(r.usage) || 0, 0);
          const unit = records[0]?.usageUnit || null;
          return { category, totalPrice, totalUsage, unit, currency: records[0]?.priceUnit };
        } catch (e) {
          return { category, error: e instanceof Error ? e.message : 'error' };
        }
      })
    );

    return NextResponse.json({ periodDays: 30, results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/admin/debug/usage] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
