# Admin sign-in. No self sign-up: only users you create can log in.
# Cognito Lite tier: first 10,000 monthly active users are free.

resource "aws_cognito_user_pool" "admins" {
  name                     = "${local.name}-admins"
  user_pool_tier           = "LITE"
  deletion_protection      = "ACTIVE"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OPTIONAL"

  software_token_mfa_configuration {
    enabled = true
  }

  admin_create_user_config {
    allow_admin_create_user_only = true
    invite_message_template {
      email_subject = "Your ${var.site_title} admin account"
      email_message = "Your ${var.site_title} admin username is {username} and your temporary password is {####}. Sign in at ${local.site_url}/admin"
      sms_message   = "Username {username}, temporary password {####}"
    }
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

resource "aws_cognito_user_pool_domain" "admins" {
  domain                = "${local.name}-${local.account_id}"
  user_pool_id          = aws_cognito_user_pool.admins.id
  managed_login_version = 1 # classic hosted UI (included in Lite)
}

# Public SPA client: authorization code + PKCE, no client secret.
resource "aws_cognito_user_pool_client" "web" {
  name                                 = "${local.name}-web"
  user_pool_id                         = aws_cognito_user_pool.admins.id
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = [for o in local.origins : "${o}/admin/callback"]
  logout_urls                          = [for o in local.origins : "${o}/"]
  explicit_auth_flows                  = ["ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_group" "admins" {
  name         = "admins"
  user_pool_id = aws_cognito_user_pool.admins.id
  description  = "Can write posts and moderate comments"
}

resource "aws_cognito_user" "owner" {
  user_pool_id             = aws_cognito_user_pool.admins.id
  username                 = var.admin_email
  desired_delivery_mediums = ["EMAIL"]
  attributes = {
    email          = var.admin_email
    email_verified = true
  }

  lifecycle {
    ignore_changes = [attributes] # the user can update their profile without Terraform fighting it
  }
}

resource "aws_cognito_user_in_group" "owner" {
  user_pool_id = aws_cognito_user_pool.admins.id
  group_name   = aws_cognito_user_group.admins.name
  username     = aws_cognito_user.owner.username
}
