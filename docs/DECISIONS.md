# Decisions

One line per decision not fixed by the specs.

- 2026-11-13 Infrastructure is Terraform (`infra/`), not CDK, at the owner's request. Terraform outputs (`infra/outputs.json`) replace `cdk-outputs.json`; output names keep the spec's names (WebBucketName, DistributionId, WebUrl, UserPoolId, UserPoolClientId, CognitoDomain, ApiUrl).
- 2026-11-13 Specs and prototype moved from the repo root into `docs/` to match the spec's layout; repo root is `AutoMoto/` (the spec's `workshop-app/`).
- 2026-11-13 Backend TypeScript is one npm package (not multiple workspaces); each Lambda is bundled separately with esbuild into `backend/dist/<name>/index.mjs`.
- 2026-11-13 TypeScript pinned to 5.x (spec), zod 4, Node 20 runtime for Lambdas (local dev may use newer Node).
- 2026-11-13 Local Supabase: edge runtime, analytics and vector storage disabled in `config.toml` (unused).
- 2026-11-13 `verify_pin` reports PIN_INVALID via an HTTP 400 error response set with `response.status` (same `{code:"P0001", message:"PIN_INVALID"}` body as a raise) instead of `raise`, so the failed attempt row is committed and lockout works. PIN_LOCKED is a normal raise.
- 2026-11-13 Lockout window counts failures since the caller's last successful PIN (ordered by attempt id), max 5 in 5 minutes.
- 2026-11-13 `work_order_events` also carries `shop_id` so Realtime `postgres_changes` can filter `shop_id=eq.<shop>` on every published table.
- 2026-11-13 Job summaries include extra keys beyond the spec (vehicle_id, customer_id, concerns[], safety_note, completed_at, picked_up_at, odometer_km) for the arrivals cards; the documented keys are all present.
- 2026-11-13 Intake Lambda uses the official `@anthropic-ai/sdk` with structured outputs (`output_config.format`) plus the zod clamp. `temperature` is omitted (Claude Haiku 5.5 rejects non-default sampling parameters with a 400); `output_config.effort: "low"` keeps thinking short; `max_tokens` is 2000 (not 800) because thinking counts toward it.
- 2026-11-13 Intake rate limit (30 calls / 10 min per staff) is kept in a DynamoDB table with TTL (`RATE_LIMIT_TABLE`); without that env var (local/dev) it falls back to an in-memory per-container counter.
