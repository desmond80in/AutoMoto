# Workshop Check-In: frontend

React 18 + Vite SPA for the kiosk, front desk, workshop, waiting-room display and administrator.
Specification: [`docs/SPEC-FRONTEND.md`](../docs/SPEC-FRONTEND.md). Backend contract: [`docs/SPEC-BACKEND.md`](../docs/SPEC-BACKEND.md).

## Run locally

Requires Node 20+, Docker, and the backend dependencies (`cd ../backend && npm ci`).

```bash
npm ci
cp public/config.example.json public/config.json   # authMode "dev", local Supabase, mock intake API
npm run dev:stack                                  # Supabase start + reset (seed), dev token server :8787,
                                                   # mock intake API :8788, Vite :5173
```

Or start the pieces yourself:

```bash
(cd ../backend && npx supabase start && npx supabase db reset)
(cd ../backend && npx tsx scripts/dev-token-server.ts)    # port 8787
npx tsx scripts/mock-intake-server.ts                     # port 8788 (add ?fail=1 to a request for a 502)
npm run dev                                               # http://localhost:5173
```

In dev mode the login page lists the seeded staff: `owner@example.com` (all roles, PIN 4321),
`ana.desk@example.com` (front desk, kiosk, display; PIN 2222), `sam.tech@example.com` (workshop; PIN 1111).
Dev sign-in refuses to start unless `stage` is `dev` and Supabase is local.

## Test

```bash
npm run lint && npm run typecheck
npm test          # Vitest: normalisers, formatters, totals, catalog, kiosk reducer, errors, quick switch, expiry, components
npm run e2e       # Playwright against the local stack (resets the database first)
```

The e2e suite covers SPEC-FRONTEND section 11 scenarios 1–13, including axe checks (no serious or critical
violations) and screenshots written to `e2e/screenshots/`.

## Configuration

Everything environment-specific is in `/config.json`, fetched at start-up (never bundled). In production it is
written by `backend/scripts/write-frontend-config.ts` from the Terraform outputs and uploaded by `npm run deploy`.

## Deploy

```bash
terraform -chdir=../infra output -json > ../infra/outputs.json
(cd ../backend && npx tsx scripts/write-frontend-config.ts)   # public/config.json with authMode "cognito"
npm run deploy
```

`npm run deploy` builds, uploads `dist/` to the private S3 bucket (hashed assets cached for a year, `index.html`
no-cache, stale files deleted), uploads `config.json` (no-cache; refuses a `dev` config) and invalidates
`/index.html` and `/config.json` on CloudFront. It uses your AWS CLI credentials (`AWS_PROFILE`, region `ca-central-1`).

**HUMAN, first deploy:** open the CloudFront URL, sign in with the owner's Google account and check that the role
picker appears.

## Device set-up checklist

- **Kiosk tablet:** sign in with the dedicated "Reception kiosk" account (roles Kiosk + Display only), choose Kiosk,
  then lock the tablet to the browser: iPad Guided Access, or Android screen pinning / a kiosk browser. Allow the
  microphone for the site if customers will talk instead of type.
- **Waiting-room TV:** sign in with the same kiosk account, choose Display panel, press **Full screen**. Disable the
  TV/computer sleep timer (the page also requests a screen wake lock).
- **Workshop phones/tablets:** sign in with each technician's Google account, allow the **camera** for the site
  (QR scanning). If the camera is blocked, "Take a photo instead" and typing the job number still work.
  **HUMAN:** check scanning a printed tag on a real phone.
- **Front desk:** a label printer for 62 × 100 mm labels (or Letter paper); the tag prints centred on its own.
- Sessions end at local midnight; each device is signed in once at the start of the day.

## Privacy notes

- The kiosk never receives full names, full phone numbers, emails or service history of customers.
- Browser speech recognition (the microphone button) may send audio to the browser vendor's speech service
  (for example Google for Chrome). Tell customers, or let them use the keyboard's dictation key or type instead.
- The authorization text on the kiosk is demo wording; replace it with the shop's legal text. The "Demo wording"
  note is hidden when `stage` is `prod`.
