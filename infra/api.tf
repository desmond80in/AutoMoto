# AI intake API: HTTP API with a Cognito JWT authorizer in front of the intake Lambda.
resource "aws_apigatewayv2_api" "intake" {
  name          = "${local.name}-intake"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = local.all_origins
    allow_methods = ["POST", "OPTIONS"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 600
  }
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.intake.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  jwt_configuration {
    issuer   = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.staff.id}"
    audience = [aws_cognito_user_pool_client.web.id]
  }
}

resource "aws_apigatewayv2_integration" "intake" {
  api_id                 = aws_apigatewayv2_api.intake.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.fn["intake-api"].invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 25000
}

resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.intake.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.intake.id}"
}

resource "aws_apigatewayv2_route" "intake" {
  for_each           = toset(["POST /intake/visit", "POST /intake/registration"])
  api_id             = aws_apigatewayv2_api.intake.id
  route_key          = each.key
  target             = "integrations/${aws_apigatewayv2_integration.intake.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/apigateway/${local.name}-intake"
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.intake.id
  name        = "$default"
  auto_deploy = true
  default_route_settings {
    throttling_rate_limit  = 5
    throttling_burst_limit = 10
  }
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api.arn
    # No request bodies or tokens in the access log.
    format = jsonencode({ requestId = "$context.requestId", route = "$context.routeKey", status = "$context.status", latency = "$context.responseLatency", sub = "$context.authorizer.claims.sub" })
  }
}

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.fn["intake-api"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.intake.execution_arn}/*/*"
}
