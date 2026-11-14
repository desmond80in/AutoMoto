# Offline infrastructure assertions (no AWS calls): terraform test
mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  mock_data "aws_cloudfront_cache_policy" {
    defaults = { id = "658327ea-f89d-4fab-a63d-7e88639e58f6" }
  }
  mock_data "aws_secretsmanager_secret_version" {
    defaults = { secret_string = "test-google-secret" }
  }
  mock_resource "aws_cloudfront_distribution" {
    defaults = { domain_name = "d111111abcdef8.cloudfront.net", arn = "arn:aws:cloudfront::123456789012:distribution/EDFDVBD6EXAMPLE", id = "EDFDVBD6EXAMPLE" }
  }
  mock_resource "aws_cognito_user_pool" {
    defaults = { id = "ca-central-1_TEST", arn = "arn:aws:cognito-idp:ca-central-1:123456789012:userpool/ca-central-1_TEST" }
  }
  mock_resource "aws_cognito_user_pool_client" {
    defaults = { id = "testclientid" }
  }
  mock_resource "aws_lambda_function" {
    defaults = { arn = "arn:aws:lambda:ca-central-1:123456789012:function:fn", invoke_arn = "arn:aws:apigateway:ca-central-1:lambda:path/2015-03-31/functions/fn/invocations" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::workshop-pov-web-test", bucket = "workshop-pov-web-test", id = "workshop-pov-web-test", bucket_regional_domain_name = "workshop-pov-web-test.s3.ca-central-1.amazonaws.com" }
  }
  mock_resource "aws_apigatewayv2_api" {
    defaults = { api_endpoint = "https://abc123.execute-api.ca-central-1.amazonaws.com", execution_arn = "arn:aws:execute-api:ca-central-1:123456789012:abc123" }
  }
  mock_resource "aws_dynamodb_table" {
    defaults = { arn = "arn:aws:dynamodb:ca-central-1:123456789012:table/rate" }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:ca-central-1:123456789012:secret:workshop/pov/x" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:ca-central-1:123456789012:log-group:x" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/x" }
  }
}
mock_provider "archive" {}
mock_provider "random" {}

variables {
  supabase_url = "https://abcdefgh.supabase.co"
}

run "auth_stack" {
  command = apply

  assert {
    condition     = aws_cognito_user_pool.staff.user_pool_tier == "ESSENTIALS"
    error_message = "User pool must use the Essentials plan (access-token customisation)."
  }
  assert {
    condition     = aws_cognito_user_pool.staff.lambda_config[0].pre_token_generation_config[0].lambda_version == "V2_0"
    error_message = "Pre token generation trigger must be V2_0."
  }
  assert {
    condition     = aws_cognito_user_pool.staff.lambda_config[0].pre_sign_up != null && aws_cognito_user_pool.staff.lambda_config[0].pre_token_generation_config[0].lambda_arn != null
    error_message = "Both Cognito triggers must be wired."
  }
  assert {
    condition     = aws_cognito_user_pool.staff.admin_create_user_config[0].allow_admin_create_user_only
    error_message = "Native self sign-up must be disabled."
  }
  assert {
    condition     = aws_cognito_user_pool_client.web.generate_secret == false && contains(aws_cognito_user_pool_client.web.allowed_oauth_flows, "code")
    error_message = "Web client must be public with the authorization code flow."
  }
  assert {
    condition     = aws_cognito_user_pool_client.web.access_token_validity == 60 && aws_cognito_user_pool_client.web.refresh_token_validity == 1 && aws_cognito_user_pool_client.web.enable_token_revocation
    error_message = "Token validity: access 60 min, refresh 1 day, revocation on."
  }
  assert {
    condition     = contains(aws_cognito_user_pool_client.web.callback_urls, "http://localhost:5173/auth/callback") && contains(aws_cognito_user_pool_client.web.callback_urls, "https://d111111abcdef8.cloudfront.net/auth/callback")
    error_message = "Callback URLs must include localhost and the CloudFront domain."
  }
  assert {
    condition     = contains(aws_cognito_user_pool_client.web.logout_urls, "https://d111111abcdef8.cloudfront.net/login")
    error_message = "Sign-out URLs must point to /login."
  }
  assert {
    condition     = length(aws_cognito_identity_provider.google) == 0
    error_message = "Google provider must wait for google_client_id."
  }
  assert {
    condition     = aws_lambda_function.fn["cognito-pre-token"].runtime == "nodejs20.x" && aws_lambda_function.fn["cognito-pre-token"].architectures[0] == "arm64" && aws_lambda_function.fn["cognito-pre-token"].memory_size == 256 && aws_lambda_function.fn["cognito-pre-token"].timeout == 5
    error_message = "Trigger Lambdas: Node.js 20, ARM64, 256 MB, 5 s."
  }
}

run "google_enabled" {
  command = apply
  variables {
    google_client_id = "123.apps.googleusercontent.com"
  }
  assert {
    condition     = length(aws_cognito_identity_provider.google) == 1 && aws_cognito_identity_provider.google[0].provider_details["authorize_scopes"] == "openid email profile"
    error_message = "Google identity provider with openid email profile."
  }
  assert {
    condition     = aws_cognito_identity_provider.google[0].attribute_mapping["email"] == "email" && aws_cognito_identity_provider.google[0].attribute_mapping["email_verified"] == "email_verified"
    error_message = "Google attribute mapping."
  }
  assert {
    condition     = toset(aws_cognito_user_pool_client.web.supported_identity_providers) == toset(["Google"])
    error_message = "Web client must use Google only."
  }
}

run "api_stack" {
  command = apply
  assert {
    condition     = aws_apigatewayv2_authorizer.cognito.jwt_configuration[0].issuer == "https://cognito-idp.ca-central-1.amazonaws.com/ca-central-1_TEST"
    error_message = "JWT authorizer issuer must be the user pool."
  }
  assert {
    condition     = aws_apigatewayv2_authorizer.cognito.jwt_configuration[0].audience == toset(["testclientid"])
    error_message = "JWT authorizer audience must be the web client."
  }
  assert {
    condition     = aws_apigatewayv2_route.health.authorization_type != "JWT" && alltrue([for r in aws_apigatewayv2_route.intake : r.authorization_type == "JWT"])
    error_message = "/health is open; intake routes need a JWT."
  }
  assert {
    condition     = aws_apigatewayv2_stage.default.default_route_settings[0].throttling_rate_limit == 5 && aws_apigatewayv2_stage.default.default_route_settings[0].throttling_burst_limit == 10
    error_message = "Stage throttling 5 rps, burst 10."
  }
  assert {
    condition     = contains(aws_apigatewayv2_api.intake.cors_configuration[0].allow_origins, "https://d111111abcdef8.cloudfront.net") && contains(aws_apigatewayv2_api.intake.cors_configuration[0].allow_origins, "http://localhost:5173")
    error_message = "CORS must allow the CloudFront origin and extra origins."
  }
  assert {
    condition     = aws_lambda_function.fn["intake-api"].memory_size == 512 && aws_lambda_function.fn["intake-api"].timeout == 20
    error_message = "Intake Lambda: 512 MB, 20 s."
  }
  assert {
    condition     = aws_dynamodb_table.rate_limit.ttl[0].enabled && aws_dynamodb_table.rate_limit.ttl[0].attribute_name == "expires_at"
    error_message = "Rate limit table needs TTL."
  }
}

run "web_stack" {
  command = apply
  assert {
    condition     = aws_s3_bucket_public_access_block.web.block_public_acls && aws_s3_bucket_public_access_block.web.block_public_policy && aws_s3_bucket_public_access_block.web.ignore_public_acls && aws_s3_bucket_public_access_block.web.restrict_public_buckets
    error_message = "Web bucket must block all public access."
  }
  assert {
    condition     = aws_s3_bucket_versioning.web.versioning_configuration[0].status == "Enabled"
    error_message = "Versioning on."
  }
  assert {
    condition     = one([for o in aws_cloudfront_distribution.web.origin : o.origin_access_control_id]) != null && aws_cloudfront_origin_access_control.web.signing_behavior == "always"
    error_message = "CloudFront must reach S3 through Origin Access Control."
  }
  assert {
    condition     = length([for e in aws_cloudfront_distribution.web.custom_error_response : e if e.response_code == 200 && e.response_page_path == "/index.html"]) == 2
    error_message = "SPA fallback: 403 and 404 -> /index.html with 200."
  }
  assert {
    condition     = aws_cloudfront_distribution.web.default_cache_behavior[0].viewer_protocol_policy == "redirect-to-https" && aws_cloudfront_distribution.web.http_version == "http2and3"
    error_message = "HTTPS redirect and HTTP/2 + 3."
  }
  assert {
    condition     = length(aws_cloudfront_distribution.web.ordered_cache_behavior) == 2
    error_message = "index.html and config.json must have no-cache behaviours."
  }
  assert {
    condition     = strcontains(aws_cloudfront_response_headers_policy.web.security_headers_config[0].content_security_policy[0].content_security_policy, "wss://abcdefgh.supabase.co")
    error_message = "CSP must allow the Supabase URL (https and wss)."
  }
  assert {
    condition     = strcontains(aws_cloudfront_response_headers_policy.web.security_headers_config[0].content_security_policy[0].content_security_policy, ".auth.ca-central-1.amazoncognito.com")
    error_message = "CSP must allow the Cognito hosted UI domain."
  }
  assert {
    condition     = aws_cloudfront_response_headers_policy.web.security_headers_config[0].strict_transport_security[0].access_control_max_age_sec > 0
    error_message = "HSTS header."
  }
  assert {
    condition     = one(aws_cloudfront_response_headers_policy.web.custom_headers_config[0].items).value == "camera=(self), microphone=(self), geolocation=()"
    error_message = "Permissions-Policy header."
  }
  assert {
    condition     = output.WebUrl == "https://d111111abcdef8.cloudfront.net" && output.ApiUrl == "https://abc123.execute-api.ca-central-1.amazonaws.com"
    error_message = "Outputs used by the config contract."
  }
}

run "region_is_locked" {
  command = plan
  variables {
    region = "us-east-1"
  }
  expect_failures = [var.region]
}
