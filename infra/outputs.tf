# Names match the CDK outputs in SPEC-BACKEND; backend/scripts/write-frontend-config.ts and frontend/scripts/deploy.ts
# read them from infra/outputs.json (terraform output -json > outputs.json).
output "WebBucketName" { value = aws_s3_bucket.web.bucket }
output "DistributionId" { value = aws_cloudfront_distribution.web.id }
output "WebUrl" { value = local.web_url }
output "UserPoolId" { value = aws_cognito_user_pool.staff.id }
output "UserPoolClientId" { value = aws_cognito_user_pool_client.web.id }
output "CognitoDomain" { value = local.cognito_host }
output "ApiUrl" { value = aws_apigatewayv2_api.intake.api_endpoint }

output "GoogleRedirectUri" {
  description = "Authorized redirect URI for the Google OAuth client (HUMAN H3)."
  value       = "https://${local.cognito_host}/oauth2/idpresponse"
}

output "CognitoIssuer" {
  description = "For Supabase third-party auth (Amazon Cognito): user pool ID + region."
  value       = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.staff.id}"
}

output "SecretNames" {
  description = "SSM SecureString parameters filled by backend/scripts/put-secrets.ts."
  value       = [for p in aws_ssm_parameter.secret : p.name]
}
