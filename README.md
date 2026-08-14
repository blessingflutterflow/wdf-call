# wdf-call

VoIP landline backend (Next.js API routes) + a thin web dialer, for the WDF
landline product. Companion Flutter app: `../wdf_call`.

Ported from RingaMo's architecture — Twilio Voice for calling, DIDLogic for
real South African geographic numbers bridged into Twilio via a dedicated SIP
Domain per number, Firebase Auth for identity. No database: Twilio itself is
the source of truth for which user owns which number (see `lib/twilio.ts`).

See **[../SETUP.md](../SETUP.md)** for the credentials/config checklist
before running this for real.

## Getting Started

```bash
npm install
cp .env.local.example .env.local   # fill in Twilio/DIDLogic/Firebase values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API routes

- `POST /api/token` — mints a Twilio Voice access token for the app
- `POST /api/voice`, `POST /api/voice/inbound` — TwiML webhooks that route calls
- `POST /api/numbers/available`, `/claim`, `/mine` — Twilio-native number search/claim
- `POST /api/numbers/didlogic/available`, `/claim`, `/spare` — DIDLogic landline numbers
- `POST /api/admin/didlogic/release` — admin cleanup, not user-facing
