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

# Secrets are SecureString parameters (standard tier, AWS managed aws/ssm key: no monthly charge). SSM needs a value,
# so Terraform creates them with a placeholder and never changes the value again; backend/scripts/put-secrets.ts
# fills them (never in git). Note: Cognito keeps the Google client secret in its identity provider config, so it
# also appears in Terraform state: protect the state.
locals {
  secret_placeholder = "unset"
  secrets = {
    supabase_secret_key  = "Supabase secret (service role) key, used by the Cognito trigger Lambdas."
    google_client_secret = "Google OAuth client secret for the Cognito Google identity provider."
    anthropic_api_key    = "Anthropic API key for the AI intake Lambda."
  }
}

resource "aws_ssm_parameter" "secret" {
  for_each    = local.secrets
  name        = "/${local.secret_prefix}/${replace(each.key, "_", "-")}"
  description = each.value
  type        = "SecureString"
  tier        = "Standard"
  value       = local.secret_placeholder
  lifecycle {
    ignore_changes = [value]
  }
}
