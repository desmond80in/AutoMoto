# Workshop Check-In

Shop-floor check-in and service-history system for an auto repair shop in Ontario: customer kiosk, front desk,
workshop (QR job tags), waiting-room display and administrator. Proof of value; multi-shop ready.

| Folder | What | Start here |
|---|---|---|
| [`docs/`](docs) | Specifications, decisions, approved prototype | `SPEC-BACKEND.md`, `SPEC-FRONTEND.md`, `DECISIONS.md` |
| [`backend/`](backend) | Supabase (Postgres RLS + RPCs, Realtime, Storage), Lambdas (Cognito triggers, AI intake), scripts | [`backend/README.md`](backend/README.md) |
| [`frontend/`](frontend) | React SPA (Vite) | [`frontend/README.md`](frontend/README.md) |
| [`infra/`](infra) | AWS in Terraform (Cognito, API Gateway, Lambda, S3 + CloudFront), `ca-central-1` | [`infra/README.md`](infra/README.md) |

Local development: `cd frontend && npm run dev:stack` (needs Docker), then open http://localhost:5173.
