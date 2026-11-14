locals {
  name          = "${var.app_name}-${var.stage}"
  secret_prefix = "${var.app_name}/${var.stage}"
  google        = var.google_client_id != ""
  supabase_host = regex("^https?://([^/]+)", var.supabase_url)[0]

  web_origin   = "https://${aws_cloudfront_distribution.web.domain_name}"
  web_origins  = concat([local.web_origin], var.custom_domain != "" ? ["https://${var.custom_domain}"] : [])
  all_origins  = distinct(concat([for o in var.web_extra_origins : trimsuffix(o, "/")], local.web_origins))
  web_url      = var.custom_domain != "" ? "https://${var.custom_domain}" : local.web_origin
  cognito_host = "${aws_cognito_user_pool_domain.web.domain}.auth.${var.region}.amazoncognito.com"
}

# Secrets are created empty; backend/scripts/put-secrets.ts fills them (never in git). Note: Cognito keeps the
# Google client secret in its identity provider config, so it also appears in Terraform state: protect the state.
resource "aws_secretsmanager_secret" "supabase_secret_key" {
  name        = "${local.secret_prefix}/supabase-secret-key"
  description = "Supabase secret (service role) key, used by the Cognito trigger Lambdas."
}

resource "aws_secretsmanager_secret" "google_client_secret" {
  name        = "${local.secret_prefix}/google-client-secret"
  description = "Google OAuth client secret for the Cognito Google identity provider."
}

resource "aws_secretsmanager_secret" "anthropic_api_key" {
  name        = "${local.secret_prefix}/anthropic-api-key"
  description = "Anthropic API key for the AI intake Lambda."
}
