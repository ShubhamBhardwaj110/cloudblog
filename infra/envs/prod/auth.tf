# Accounts for writers and commenters. Anyone can sign up with email + password;
# Cognito's hosted pages handle sign-up, email verification and password reset.
# Lite tier: the first 10,000 monthly active users are free.
#
# Note: Cognito's built-in email sender is limited to 50 emails/day (sign-up codes,
# password resets). Plenty to launch; switch to SES with your own domain to go beyond.

resource "aws_cognito_user_pool" "users" {
  name                     = "${local.name}-users"
  user_pool_tier           = "LITE"
  deletion_protection      = "ACTIVE"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OPTIONAL"

  software_token_mfa_configuration {
    enabled = true
  }

  admin_create_user_config {
    allow_admin_create_user_only = false # open sign-up

    invite_message_template {
      email_subject = "Your ${var.site_title} account"
      email_message = "Welcome to ${var.site_title}! Your username is {username} and your temporary password is {####}. Sign in at ${local.site_url}/studio"
      sms_message   = "Username {username}, temporary password {####}"
    }
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your ${var.site_title} verification code"
    email_message        = "Welcome to ${var.site_title}! Your verification code is {####}"
  }

  password_policy {
    minimum_length                   = 10
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

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
    string_attribute_constraints {
      min_length = 3
      max_length = 254
    }
  }
}

resource "aws_cognito_user_pool_domain" "users" {
  domain                = "${local.name}-${local.account_id}"
  user_pool_id          = aws_cognito_user_pool.users.id
  managed_login_version = 1 # classic hosted UI (included in Lite)
}

# Public SPA client: authorization code + PKCE, no client secret.
resource "aws_cognito_user_pool_client" "web" {
  name                                 = "${local.name}-web"
  user_pool_id                         = aws_cognito_user_pool.users.id
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = [for o in local.origins : "${o}/auth/callback"]
  logout_urls                          = [for o in local.origins : "${o}/"]
  explicit_auth_flows                  = ["ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
  read_attributes                      = ["email", "email_verified", "name"]
  write_attributes                     = ["email", "name"]

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
  user_pool_id = aws_cognito_user_pool.users.id
  description  = "Site moderators: can unpublish/delete any post or comment and suspend users"
}

# The site owner: created here and placed in the admins group.
resource "aws_cognito_user" "owner" {
  user_pool_id             = aws_cognito_user_pool.users.id
  username                 = var.admin_email
  desired_delivery_mediums = ["EMAIL"]
  attributes = {
    email          = var.admin_email
    email_verified = true
  }

  lifecycle {
    ignore_changes = [attributes]
  }
}

resource "aws_cognito_user_in_group" "owner" {
  user_pool_id = aws_cognito_user_pool.users.id
  group_name   = aws_cognito_user_group.admins.name
  username     = aws_cognito_user.owner.username
}
