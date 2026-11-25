locals {
  name       = var.project
  account_id = data.aws_caller_identity.current.account_id
  site_url   = "https://${aws_cloudfront_distribution.site.domain_name}"
  alert_to   = var.alert_email != "" ? var.alert_email : var.admin_email
  origins    = concat([local.site_url], var.dev_origins)
}
