output "site_url" {
  value = local.site_url
}

output "distribution_id" {
  value = aws_cloudfront_distribution.site.id
}

output "site_bucket" {
  value = aws_s3_bucket.this["site"].bucket
}

output "publisher_function" {
  value = module.publisher.function_name
}

# Consumed by the deploy pipeline to write frontend/public/config.json
output "frontend_config" {
  value = {
    apiUrl        = aws_apigatewayv2_api.this.api_endpoint
    region        = var.region
    userPoolId    = aws_cognito_user_pool.admins.id
    clientId      = aws_cognito_user_pool_client.web.id
    cognitoDomain = "https://${aws_cognito_user_pool_domain.admins.domain}.auth.${var.region}.amazoncognito.com"
    siteTitle     = var.site_title
    siteTagline   = var.site_description
  }
}
