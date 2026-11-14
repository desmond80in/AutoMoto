# Decisions

One line per decision not fixed by the specs.

- 2026-11-13 Infrastructure is Terraform (`infra/`), not CDK, at the owner's request. Terraform outputs (`infra/outputs.json`) replace `cdk-outputs.json`; output names keep the spec's names (WebBucketName, DistributionId, WebUrl, UserPoolId, UserPoolClientId, CognitoDomain, ApiUrl).
- 2026-11-13 Specs and prototype moved from the repo root into `docs/` to match the spec's layout; repo root is `AutoMoto/` (the spec's `workshop-app/`).
- 2026-11-13 Backend TypeScript is one npm package (not multiple workspaces); each Lambda is bundled separately with esbuild into `backend/dist/<name>/index.mjs`.
- 2026-11-13 TypeScript pinned to 5.x (spec), zod 4, Node 20 runtime for Lambdas (local dev may use newer Node).
- 2026-11-13 Local Supabase: edge runtime, analytics and vector storage disabled in `config.toml` (unused).
