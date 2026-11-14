# Lambdas are bundled by the backend (npm run build:lambdas) into <lambda_dist_dir>/<name>/index.mjs.
locals {
  lambdas = {
    cognito-pre-signup = { memory = 256, timeout = 5, secrets = [aws_secretsmanager_secret.supabase_secret_key.arn] }
    cognito-pre-token  = { memory = 256, timeout = 5, secrets = [aws_secretsmanager_secret.supabase_secret_key.arn] }
    intake-api         = { memory = 512, timeout = 20, secrets = [aws_secretsmanager_secret.anthropic_api_key.arn] }
  }
}

data "archive_file" "lambda" {
  for_each    = local.lambdas
  type        = "zip"
  source_dir  = "${var.lambda_dist_dir}/${each.key}"
  output_path = "${path.module}/.build/${each.key}.zip"
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  for_each           = local.lambdas
  name               = "${local.name}-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
  for_each   = local.lambdas
  role       = aws_iam_role.lambda[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "lambda" {
  for_each = local.lambdas
  statement {
    sid       = "ReadOwnSecrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = each.value.secrets
  }
  dynamic "statement" {
    for_each = each.key == "intake-api" ? [1] : []
    content {
      sid       = "RateLimitCounter"
      actions   = ["dynamodb:UpdateItem"]
      resources = [aws_dynamodb_table.rate_limit.arn]
    }
  }
}

resource "aws_iam_role_policy" "lambda" {
  for_each = local.lambdas
  name     = "access"
  role     = aws_iam_role.lambda[each.key].id
  policy   = data.aws_iam_policy_document.lambda[each.key].json
}

resource "aws_cloudwatch_log_group" "lambda" {
  for_each          = local.lambdas
  name              = "/aws/lambda/${local.name}-${each.key}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "fn" {
  for_each         = local.lambdas
  function_name    = "${local.name}-${each.key}"
  role             = aws_iam_role.lambda[each.key].arn
  runtime          = "nodejs20.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.lambda[each.key].output_path
  source_code_hash = data.archive_file.lambda[each.key].output_base64sha256
  memory_size      = each.value.memory
  timeout          = each.value.timeout
  environment {
    variables = each.key == "intake-api" ? {
      ANTHROPIC_API_KEY_ARN = aws_secretsmanager_secret.anthropic_api_key.arn
      ANTHROPIC_MODEL       = var.anthropic_model
      RATE_LIMIT_TABLE      = aws_dynamodb_table.rate_limit.name
      } : {
      SUPABASE_URL            = var.supabase_url
      SUPABASE_SECRET_KEY_ARN = aws_secretsmanager_secret.supabase_secret_key.arn
    }
  }
  depends_on = [aws_cloudwatch_log_group.lambda, aws_iam_role_policy_attachment.lambda_logs]
}

# Per-staff intake rate limit (30 calls / 10 minutes), expired by TTL.
resource "aws_dynamodb_table" "rate_limit" {
  name         = "${local.name}-intake-rate-limit"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  attribute {
    name = "pk"
    type = "S"
  }
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
  server_side_encryption { enabled = true }
}
