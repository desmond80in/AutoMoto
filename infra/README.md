# Workshop Check-In: AWS infrastructure (Terraform)

Everything is in **Canada (Central), `ca-central-1`** (CloudFront is global). This replaces the CDK stacks described
in `docs/SPEC-BACKEND.md` sections 10–12 with the same design:

| File | What |
|---|---|
| `auth.tf` | Cognito user pool (Essentials plan, Google sign-in only), pre sign-up + pre token generation (V2_0) triggers, hosted UI domain, public `web` client (code + PKCE), optional Google identity provider |
| `lambdas.tf` | The three Lambdas (Node.js 20, ARM64) from `backend/dist`, least-privilege IAM, log groups, DynamoDB rate-limit table (TTL) |
| `api.tf` | HTTP API with a Cognito JWT authorizer: `GET /health`, `POST /intake/visit`, `POST /intake/registration`; CORS; 5 rps / burst 10 |
| `web.tf` | Private, versioned, encrypted S3 bucket; CloudFront with Origin Access Control, SPA fallback, HTTPS only, HTTP/2+3, no-cache for `index.html`/`config.json`, security headers (HSTS, CSP, Permissions-Policy, …); placeholder page |
| `main.tf` | Secrets Manager secrets (created empty) |
| `outputs.tf` | `WebBucketName`, `DistributionId`, `WebUrl`, `UserPoolId`, `UserPoolClientId`, `CognitoDomain`, `ApiUrl`, `GoogleRedirectUri`, `CognitoIssuer` |

## Test (offline)

```bash
terraform init -backend=false
terraform validate
terraform test      # mocked providers: Essentials plan, V2_0 trigger, JWT issuer/audience, private bucket, OAC, SPA errors, CSP …
```

## Deploy runbook

Prerequisites: Terraform ≥ 1.7, AWS CLI credentials for the account (**HUMAN H2**:
`aws sts get-caller-identity` works), Node 20+. Optionally copy `backend.tf.example` to `backend.tf` for S3 state.

1. **Supabase project (HUMAN H1).** Create it in Canada (Central). Fill `backend/.env` from `.env.example`
   (URL, ref, publishable key, `SUPABASE_DB_URL`).
2. **Build the Lambdas:** `cd backend && npm ci && npm run build:lambdas`.
3. **First apply (no Google yet):**
   ```bash
   cd infra
   cp terraform.tfvars.example terraform.tfvars   # set supabase_url
   terraform init
   terraform apply
   terraform output GoogleRedirectUri
   ```
4. **Google OAuth client (HUMAN H3).** Google Cloud console → APIs & Services → Credentials → OAuth client ID
   (Web application). Authorized redirect URI: the `GoogleRedirectUri` output. Note the client ID and secret.
5. **Secrets (HUMAN H4):** `cd backend && npx tsx scripts/put-secrets.ts` and paste the Supabase secret key, the
   Google client secret and the Anthropic API key (typed values are not echoed).
6. **Second apply with Google:** set `google_client_id` in `terraform.tfvars`, then `terraform apply`.
7. **Supabase third-party auth:** Supabase dashboard → Authentication → Third-party auth → Amazon Cognito, with the
   `UserPoolId` output and region `ca-central-1`.
8. **Database:** `cd backend && npx supabase link --project-ref <ref> && npx supabase db push` (migrations only).
9. **Owner (HUMAN H5):** set `OWNER_EMAIL`, `OWNER_NAME`, `SHOP_NAME` in `backend/.env`, then
   `npx tsx scripts/bootstrap-owner.ts`.
10. **Frontend:**
    ```bash
    terraform -chdir=infra output -json > infra/outputs.json
    (cd backend && npx tsx scripts/write-frontend-config.ts)
    (cd frontend && npm ci && npm run deploy)
    ```
11. **Smoke test:** `cd backend && npx tsx scripts/smoke.ts` (`/health`, 401 without a token, HTTPS, SPA fallback;
    add `SMOKE_TOKEN=<Cognito access token>` to check `me()` through Supabase).
12. **HUMAN:** open the `WebUrl`, sign in with the owner's Google account and check the role picker appears.

Custom domain (**HUMAN H6**, optional): request an ACM certificate in **us-east-1**, set `custom_domain` and
`acm_certificate_arn`, apply, then point the DNS record (CNAME/alias) at the CloudFront domain.

## Redeploying

- Lambda code: `npm run build:lambdas` (backend) then `terraform apply` (the zip hash changes).
- Frontend: `npm run deploy` (frontend).
- Rotate a secret: `npx tsx scripts/put-secrets.ts <name>`; Lambdas cache secrets per container, so force fresh
  containers with any Lambda config change or `terraform apply -replace='aws_lambda_function.fn["intake-api"]'`.
  For the Google client secret, run `terraform apply` again (Cognito holds a copy).

## Notes

- The Google client secret is copied into the Cognito identity provider, so it also appears in Terraform state.
  Keep the state private (local file or an encrypted S3 backend with restricted access).
- The CSP allows `https://*.execute-api.ca-central-1.amazonaws.com`: an exact API URL would make CloudFront depend
  on the API, whose CORS depends on the CloudFront domain (a dependency cycle).
- The user pool has deletion protection and the web bucket can't be destroyed while it has objects in `pov`
  (the equivalent of the spec's RETAIN policy).
