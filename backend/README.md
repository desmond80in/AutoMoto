# Workshop Check-In: backend

Supabase (Postgres, RLS, RPCs, Realtime, Storage) plus three AWS Lambdas (Cognito triggers, AI intake API).
AWS infrastructure is Terraform in [`../infra`](../infra). Specification: [`docs/SPEC-BACKEND.md`](../docs/SPEC-BACKEND.md).

## Architecture

```
Browser SPA ──► CloudFront ──► S3 (static app + /config.json)
     │  Hosted UI (Google)        Cognito user pool ── pre sign-up / pre token (V2_0) Lambdas ──► Supabase (staff lookup)
     │  HTTPS + JWT               API Gateway HTTP API (JWT authorizer) ──► intake-api Lambda ──► Anthropic Messages API
     └─ supabase-js + Cognito access token (third-party auth) ──► Supabase: RLS reads, RPC writes, Realtime, Storage
```

- All business rules are Postgres functions (`supabase/migrations`). Clients **read** through RLS and **write only through RPCs**.
- Every write RPC takes `p_session` (a `device_sessions.id`) and checks the device's active role.
- The Cognito pre-token Lambda adds `role=authenticated`, `staff_id`, `shop_id`, `app_roles`, `staff_email` claims, which Supabase and RLS use.
- Everything runs in `ca-central-1`.

## Layout

| Path | What |
|---|---|
| `supabase/migrations/` | schema + RLS + views (`…0100`), sessions/PINs (`…0200`), kiosk (`…0300`), jobs (`…0400`), records/admin (`…0500`), realtime/storage/grants (`…0600`) |
| `supabase/seed.sql` | local demo data (matches the prototype) |
| `supabase/tests/` | pgTAP tests (`_helpers.sql` has `tests.as_staff()` / `tests.reset()`) |
| `lambdas/` | `cognito-pre-signup`, `cognito-pre-token`, `intake-api`, `shared` |
| `scripts/` | dev tokens, Lambda bundling, secrets, owner bootstrap, frontend config, smoke test |

## Run locally

Requires Node 20+, Docker.

```bash
cd backend
npm ci
npx supabase start          # local stack (API :54321, DB :54322, Studio :54323)
npx supabase db reset       # migrations + seed
npx supabase test db        # pgTAP
npm test                    # Vitest (Lambdas)
npm run lint && npm run typecheck
npx tsx scripts/dev-token-server.ts   # dev JWTs on :8787 for the frontend's authMode "dev"
```

Seeded logins (local only, dev auth): `owner@example.com` (all roles, PIN 4321), `ana.desk@example.com`
(front desk, kiosk, display; PIN 2222), `sam.tech@example.com` (workshop; PIN 1111).
`npx tsx scripts/mint-dev-token.ts ana.desk@example.com` prints a 12-hour token for curl. Both dev-token tools refuse to run
unless `SUPABASE_URL` is localhost.

## Deploy

1. **Supabase (HUMAN H1):** project in Canada (Central). The Free plan is fine for a demo; use Pro once real customer
   data goes in (daily backups, no pausing). See "Supabase plan" below.
   Put URL, ref and publishable key in `backend/.env` (copy `.env.example`), plus `SUPABASE_DB_URL` for the bootstrap script.
2. **AWS (HUMAN H2):** CLI credentials for `ca-central-1`.
3. **Lambdas:** `npm run build:lambdas` (Terraform zips `dist/<name>/`).
4. **Terraform:** see [`../infra/README.md`](../infra/README.md). First apply without Google; it prints the Google redirect URI.
5. **Google OAuth client (HUMAN H3):** add the printed redirect URI, then set `google_client_id` and store the client secret.
6. **Secrets:** `npx tsx scripts/put-secrets.ts` (Supabase secret key, Google client secret, Anthropic API key, HUMAN H4).
   Apply Terraform again so Cognito gets the Google provider.
7. **Supabase third-party auth:** dashboard → Authentication → Third-party auth → Amazon Cognito, user pool ID from
   `terraform output UserPoolId`, region `ca-central-1`.
8. **Database:** `npx supabase link --project-ref <ref>` then `npx supabase db push` (migrations only, never the seed).
9. **Owner (HUMAN H5):** set `OWNER_EMAIL`, `OWNER_NAME`, `SHOP_NAME`, then `npx tsx scripts/bootstrap-owner.ts`.
10. **Frontend config:** `terraform -chdir=../infra output -json > ../infra/outputs.json` and
    `npx tsx scripts/write-frontend-config.ts` → `frontend/public/config.json`.
11. **Smoke:** `npx tsx scripts/smoke.ts` (add `SMOKE_TOKEN=<Cognito access token>` to check `me()` too).

## Environment variables (`backend/.env`)

| Name | Used by | Notes |
|---|---|---|
| `AWS_REGION` | scripts | `ca-central-1` |
| `APP_NAME`, `STAGE` | scripts, Terraform | secret parameter names are `/<app>/<stage>/<name>` |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_REF` | config, smoke | public values |
| `SUPABASE_DB_URL` | bootstrap-owner | contains the DB password; `.env` only |
| `GOOGLE_CLIENT_ID` | Terraform (`google_client_id`) | public |
| `ANTHROPIC_MODEL` | intake Lambda | default `claude-haiku-5-5` |
| `WEB_EXTRA_ORIGINS` | Terraform, config | comma-separated, e.g. `http://localhost:5173` |
| `OWNER_EMAIL`, `OWNER_NAME`, `SHOP_NAME`, `SHOP_TIMEZONE` | bootstrap-owner | |

Lambda environment (set by Terraform): `SUPABASE_URL`, `SUPABASE_SECRET_KEY_PARAM`, `ANTHROPIC_API_KEY_PARAM`,
`ANTHROPIC_MODEL`, `RATE_LIMIT_TABLE`. Secrets are SSM Parameter Store SecureString parameters (standard tier, AWS
managed `aws/ssm` key, no monthly charge), read once per container at cold start, never from git.

### Supabase plan

| | Free (demo) | Pro (real customers) |
|---|---|---|
| Cost | $0 | US$25/month (includes the Micro compute credit) |
| Pausing | Paused after 7 days without activity: restore it from the dashboard before a demo | Never paused |
| Backups | None | Daily, 7 days kept |
| Database / file storage | 500 MB / 1 GB (years of demo data) | 8 GB / 100 GB |

Before relying on Free, check in the dashboard that the project can enable third-party auth (Amazon Cognito) in
Canada (Central). Upgrading later is a plan change on the same project: no data move, no config change.

## Error codes

Raised by RPCs as the error message; PostgREST returns `{ code: "P0001", message: "<CODE>", details: "<detail>" }` (HTTP 400).

| Code | Meaning |
|---|---|
| `NOT_STAFF` | no active staff row for the token |
| `SESSION_INVALID` / `SESSION_EXPIRED` | session not yours / ended or past local midnight |
| `ROLE_NOT_ALLOWED` | the session role (or your staff roles) can't do this |
| `QUICK_SWITCH_NOT_ALLOWED` | switch needs sign-out (roles not both in `quick_switch`) |
| `PIN_INVALID` / `PIN_LOCKED` (detail = seconds) / `PIN_NOT_SET` | kiosk/display unlock |
| `VALIDATION` (detail = field) | bad input |
| `NOT_FOUND` | record not in your shop |
| `PLATE_TAKEN`, `PHONE_TAKEN`, `EMAIL_TAKEN` | uniqueness |
| `VERSION_CONFLICT` | job changed since you loaded it |
| `INVALID_TRANSITION` | status change not allowed from the current status |
| `LAST_ADMIN`, `SELF_DEACTIVATE` | admin guards |
| `NOT_CURRENT_OWNER` | customer isn't a current owner of the vehicle |

Intake API: `400 VALIDATION`, `401` (no/invalid token, from API Gateway), `403 ROLE_NOT_ALLOWED`, `422 NOT_UNDERSTOOD`,
`429 RATE_LIMITED`, `502 AI_UNAVAILABLE`.

## RPCs

| RPC | Roles | Purpose |
|---|---|---|
| `me()` | any staff | staff profile + shop |
| `start_session(p_role, p_device_label)` | own roles | start a device session (expires at local midnight) |
| `get_session(p_session)` | owner | check a stored session |
| `switch_role(p_session, p_role)` | quick switch | end session and start one in another role |
| `end_session(p_session)` | owner | sign out the device |
| `set_my_pin(p_pin)` | any staff | set own 4–6 digit PIN |
| `verify_pin(p_session, p_pin)` | kiosk, display | unlock with own or an admin's PIN |
| `kiosk_lookup(p_session, p_query)` | kiosk | find by phone or plate (masked) |
| `kiosk_customer_vehicles(p_session, p_customer_id)` | kiosk | a customer's current vehicles (masked) |
| `kiosk_register(p_session, p_customer, p_vehicle)` | kiosk | new/returning customer + vehicle |
| `kiosk_add_vehicle(p_session, p_customer_id, p_vehicle)` | kiosk | add a vehicle |
| `kiosk_link_owner(p_session, p_vehicle_id, p_customer, p_mode)` | kiosk | bought it / co-owner (unverified) |
| `kiosk_check_in(p_session, p)` | kiosk | create the work order with signature |
| `create_work_order(p_session, p)` | frontdesk, admin | staff-created work order |
| `save_work_order(p_session, p_id, p_expected_version, p_patch)` | frontdesk, workshop, admin | edit details, concerns, items |
| `job_transition(p_session, p_id, p_to, p_expected_version, p_reason?)` | per transition | lifecycle step, audited; `cancelled` from any open stage by frontdesk/admin, reason required |
| `get_work_order(p_id)` | frontdesk, workshop, admin | full job |
| `list_jobs(p_scope)` | frontdesk, workshop, admin | `active`, `arrivals`, `queue`, `mine`, `recent_picked_up` |
| `find_job_by_code(p_code)` | frontdesk, workshop, admin | QR `WO:<uuid>`, order no, or last ≥3 digits |
| `search_all(p_query)` | frontdesk, admin | customers, vehicles, jobs |
| `get_customer(p_id)` / `get_vehicle(p_id)` | frontdesk, admin | drawers with history |
| `update_customer` / `update_vehicle` | frontdesk, admin | edit records |
| `owner_add` / `owner_end` / `owner_verify` | frontdesk, admin | ownership management |
| `list_customers(p_query?, p_limit?, p_offset?)` / `list_vehicles(…)` | frontdesk, admin | `{ total, items }`; customers by name, phone or current plate, vehicles by plate or VIN; 25 per page (max 100) |
| `list_staff()` | admin | staff (never PIN hashes) |
| `staff_upsert(p_session, p)` | admin | add/edit staff, roles, quick switch, PIN |
| `update_shop(p_session, p)` | admin | name, HST rate, labour rate |

Views: `v_display_board` (display, frontdesk, admin; masked names), `v_work_order_totals`, `v_job_durations` (admin).
Realtime: `postgres_changes` on `work_orders`, `work_order_events`, `vehicle_owners`; private broadcast `board_changed`
on topic `shop:<shop_id>` for the display.

## Operate

- **Add staff:** Administrator → Staff & roles → Add staff member (Gmail address, roles, PIN). They sign in with Google.
  Deactivating staff blocks their next token refresh (pre-token trigger) and every RPC immediately.
- **Rotate secrets:** `npx tsx scripts/put-secrets.ts <name>`. Lambdas cache secrets per container; force a refresh with
  `terraform apply -replace='aws_lambda_function.fn["intake-api"]'` (or any config change), or wait for containers to recycle.
  Rotating the Supabase secret key: create a new key in the Supabase dashboard, store it, redeploy, then delete the old key.
- **Redeploy:** `npm run build:lambdas && terraform -chdir=../infra apply`. Database changes: new migration file, test
  locally (`supabase db reset && supabase test db`), then `supabase db push`.
- **Restore a backup:** Supabase dashboard → Database → Backups (daily on Pro; enable PITR for finer restores). Restore to
  a new project if possible, verify, then switch `SUPABASE_URL`/keys in `.env`, rewrite `config.json` and redeploy.
  The signatures bucket is not part of database backups; copy it with the Storage API if needed.

## Known PoV limitation (SPEC-BACKEND 7.5)

The kiosk device is signed in by a real staff member, whose token carries all of their roles. Someone skilled with the
device in hand could call other RPCs from browser dev tools. Mitigations in v1: the kiosk UI is locked behind a PIN,
and every RPC checks the **session** role. **Recommended:** create a dedicated "Reception kiosk" staff account (Google
Workspace or a spare Gmail) with only the `kiosk` and `display` roles and use it to sign in the kiosk and the TV.
A production version should issue device-bound kiosk credentials.
