# Cognito user pool: Google sign-in only, Essentials plan (needed for access-token customisation by the V2_0 trigger).
resource "random_string" "domain_suffix" {
  length  = 4
  special = false
  upper   = false
}

resource "aws_cognito_user_pool" "staff" {
  name                     = "${local.name}-staff"
  user_pool_tier           = "ESSENTIALS"
  deletion_protection      = var.stage == "pov" ? "ACTIVE" : "INACTIVE"
  auto_verified_attributes = ["email"]

  # No self sign-up for native users; federated (Google) users are gated by the pre sign-up trigger.
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "admin_only"
      priority = 1
    }
  }

  lambda_config {
    pre_sign_up = aws_lambda_function.fn["cognito-pre-signup"].arn
    pre_token_generation_config {
      lambda_arn     = aws_lambda_function.fn["cognito-pre-token"].arn
      lambda_version = "V2_0"
    }
  }
}

resource "aws_lambda_permission" "cognito" {
  for_each      = toset(["cognito-pre-signup", "cognito-pre-token"])
  statement_id  = "AllowCognito"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.fn[each.key].function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.staff.arn
}

resource "aws_cognito_user_pool_domain" "web" {
  domain       = "${local.name}-${random_string.domain_suffix.result}"
  user_pool_id = aws_cognito_user_pool.staff.id
}

# Google identity provider: enabled once google_client_id is set and the client secret is stored (HUMAN H3).
data "aws_secretsmanager_secret_version" "google" {
  count     = local.google ? 1 : 0
  secret_id = aws_secretsmanager_secret.google_client_secret.id
}

resource "aws_cognito_identity_provider" "google" {
  count         = local.google ? 1 : 0
  user_pool_id  = aws_cognito_user_pool.staff.id
  provider_name = "Google"
  provider_type = "Google"
  provider_details = {
    client_id        = var.google_client_id
    client_secret    = data.aws_secretsmanager_secret_version.google[0].secret_string
    authorize_scopes = "openid email profile"
  }
  attribute_mapping = {
    email          = "email"
    name           = "name"
    email_verified = "email_verified"
    username       = "sub"
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name                                 = "web"
  user_pool_id                         = aws_cognito_user_pool.staff.id
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  # Until Google is configured the client has no usable provider; nobody can sign in yet.
  supported_identity_providers  = local.google ? ["Google"] : ["COGNITO"]
  callback_urls                 = [for o in local.all_origins : "${o}/auth/callback"]
  logout_urls                   = [for o in local.all_origins : "${o}/login"]
  explicit_auth_flows           = ["ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 1
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  depends_on = [aws_cognito_identity_provider.google]
}
