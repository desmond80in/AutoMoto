# CLAUDE.md

Workshop Check-In: a shop-floor system (kiosk, front desk, workshop, waiting-room display, admin) for one auto repair shop in Ontario, Canada. Proof of value, designed to grow into multi-shop.

## Source of truth

- `docs/SPEC-BACKEND.md` — backend contract (tables, RPCs, error codes, token claims, config.json). Build order 1.
- `docs/SPEC-FRONTEND.md` — frontend spec. Build order 2.
- `docs/prototype/workshop-prototype.html` — approved clickable prototype: UI wording, styles, sample data, AI prompts.
- `docs/DECISIONS.md` — one line per decision not covered by the specs. Append to it whenever you choose something the spec leaves open.

Names in the specs (functions, tables, columns, claims, error codes, endpoints, config keys) are contracts: use them **exactly**.

## Deviation from the spec: Terraform instead of CDK

The backend spec describes AWS infrastructure with CDK (`backend/infra`). This repo uses **Terraform** in `infra/` instead (requested by the owner). Everything else about the AWS design (Cognito Essentials + Google IdP + V2_0 pre-token trigger, HTTP API + JWT authorizer, private S3 + CloudFront OAC, Secrets Manager, region `ca-central-1`) stays as specified. Terraform outputs replace `cdk-outputs.json`: `terraform -chdir=infra output -json > infra/outputs.json`, and both `backend/scripts/write-frontend-config.ts` and `frontend/scripts/deploy.ts` read that file. Output names keep the spec's names (`WebBucketName`, `DistributionId`, `WebUrl`, …).

## Layout

```
docs/                 specs, decisions, prototype
backend/              npm workspaces root (Node 20+, TS strict)
  supabase/           config.toml, migrations/, seed.sql, tests/ (pgTAP)
  lambdas/            cognito-pre-signup, cognito-pre-token, intake-api, shared
  scripts/            bootstrap-owner, mint-dev-token, dev-token-server, write-frontend-config, put-secrets, smoke
frontend/             Vite + React 18 SPA
infra/                Terraform (AWS, ca-central-1)
```

## Architecture in one paragraph

All business rules live in Postgres (Supabase) as `security definer` RPCs with RLS; clients read via RLS-protected selects and write only via RPCs that take `p_session` (a `device_sessions.id`). Cognito (Google federation only) is the sole identity provider; a Pre Token Generation V2_0 Lambda adds `role=authenticated, staff_id, shop_id, app_roles, staff_email` claims, and Supabase accepts the Cognito access token as third-party auth. Lambda is used only for Cognito triggers and the AI intake API (Anthropic Messages API). The SPA is static in S3 behind CloudFront and reads all runtime settings from `/config.json`.

## Commands

Backend (`cd backend`):
- `npx supabase start` / `npx supabase db reset` — local stack, migrations + seed
- `npx supabase test db` — pgTAP tests
- `npm run lint`, `npm run typecheck`, `npm test` (Vitest for lambdas/scripts)
- `npm run build:lambdas` — bundle lambdas into `backend/dist/<name>/index.js` (used by Terraform)
- `npx tsx scripts/dev-token-server.ts` — dev JWTs on :8787

Frontend (`cd frontend`):
- `npm run dev` (Vite :5173), `npm test`, `npm run e2e`, `npm run lint`, `npm run typecheck`
- `npx tsx scripts/mock-intake-server.ts` — mock intake API on :8788

Infra (`cd infra`): `terraform init`, `terraform plan`, `terraform apply`, then `terraform output -json > outputs.json`.

## Rules

- Region `ca-central-1` for everything (CloudFront is global; its ACM cert, if any, is in `us-east-1`).
- Never commit secrets. Secrets go in AWS Secrets Manager or untracked `.env`. Commit `.env.example`.
- Steps that need a person (accounts, credentials, consoles) are marked **HUMAN** in the specs: print exactly what is needed and stop.
- SQL: every RPC is `security definer`, `set search_path = public, pg_temp`, granted to `authenticated` only, raises errors via `app.raise(code, detail)`. JSON keys are snake_case.
- Bump `work_orders.version` inside each RPC that changes a job (no blanket trigger).
- Kiosk RPCs never return full names, full phones, emails or service history.
- Lambdas never log tokens, PINs or customer text.
- Frontend: no environment-specific values in the bundle; Canadian English; keep prototype wording.
- Commit after each verified phase: `backend: phase N - <name>` / `frontend: phase N - <name>` / `infra: <name>`.
