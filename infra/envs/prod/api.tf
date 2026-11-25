# HTTP API: $1 per million requests (vs $3.50 for REST APIs) and built-in JWT auth.

resource "aws_apigatewayv2_api" "this" {
  name          = "${local.name}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = local.origins
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.this.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    issuer   = "https://${aws_cognito_user_pool.users.endpoint}"
    audience = [aws_cognito_user_pool_client.web.id]
  }
}

locals {
  lambdas = {
    public = module.public_api
    app    = module.app_api
    admin  = module.admin_api
  }

  # route => integration. Routes on "app" and "admin" require a valid Cognito ID token.
  routes = merge(
    { for r in [
      "GET /posts",
      "GET /posts/{slug}",
      "POST /posts/{slug}/views",
      "GET /posts/{slug}/comments",
      "GET /authors/{handle}",
    ] : r => "public" },
    { for r in [
      "GET /me",
      "PUT /me",
      "GET /me/stats",
      "GET /me/posts",
      "GET /me/posts/{postId}",
      "POST /me/posts",
      "PUT /me/posts/{postId}",
      "DELETE /me/posts/{postId}",
      "POST /me/uploads",
      "POST /posts/{slug}/comments",
      "DELETE /posts/{slug}/comments/{commentKey}",
      "POST /posts/{slug}/report",
    ] : r => "app" },
    { for r in [
      "GET /admin/stats",
      "GET /admin/posts",
      "POST /admin/posts/{postId}/unpublish",
      "DELETE /admin/posts/{postId}",
      "GET /admin/comments",
      "GET /admin/users",
      "POST /admin/users/{userId}/suspend",
      "POST /admin/users/{userId}/unsuspend",
      "POST /admin/rebuild",
    ] : r => "admin" },
  )
}

resource "aws_apigatewayv2_integration" "this" {
  for_each               = local.lambdas
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = each.value.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 10000
}

resource "aws_apigatewayv2_route" "this" {
  for_each           = local.routes
  api_id             = aws_apigatewayv2_api.this.id
  route_key          = each.key
  target             = "integrations/${aws_apigatewayv2_integration.this[each.value].id}"
  authorization_type = each.value == "public" ? "NONE" : "JWT"
  authorizer_id      = each.value == "public" ? null : aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_cloudwatch_log_group" "api_access" {
  name              = "/aws/apigateway/${local.name}-api"
  retention_in_days = 14
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  # Throttling is the free alternative to WAF for keeping bots and runaway clients in check.
  default_route_settings {
    throttling_burst_limit = 50
    throttling_rate_limit  = 25
  }

  route_settings {
    route_key              = "POST /posts/{slug}/comments"
    throttling_burst_limit = 5
    throttling_rate_limit  = 2
  }

  route_settings {
    route_key              = "POST /posts/{slug}/report"
    throttling_burst_limit = 2
    throttling_rate_limit  = 1
  }

  route_settings {
    route_key              = "POST /me/posts"
    throttling_burst_limit = 5
    throttling_rate_limit  = 1
  }

  route_settings {
    route_key              = "POST /posts/{slug}/views"
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_access.arn
    format = jsonencode({
      requestId = "$context.requestId"
      ip        = "$context.identity.sourceIp"
      route     = "$context.routeKey"
      status    = "$context.status"
      latencyMs = "$context.responseLatency"
      error     = "$context.error.message"
      authError = "$context.authorizer.error"
    })
  }

  depends_on = [aws_apigatewayv2_route.this]
}

resource "aws_lambda_permission" "api" {
  for_each      = local.lambdas
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = each.value.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}
